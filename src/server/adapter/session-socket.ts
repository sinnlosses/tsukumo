// フレーム（サーバ → ブラウザ）とコマンド（ブラウザ → サーバ）が通る WebSocket の境界
// （`GET /ws?t=<起動トークン>`）。**ページと素材を配る HTTP は別の境界**（`server.ts`。
// ここは `listen` 済みのサーバに upgrade の受け口を足すだけで、自分では listen しない）。
//
// **`Bun.serve` の WebSocket には寄せない**（`ws` パッケージ。docs/coding-standards.md
// 「Bun固有APIに寄せない」）。
//
// 安全のための決まり（docs/design.md 9章）:
//   - **起動トークン**（`server.ts` の `createStartupToken`。起動ごとの乱数で、ディスクに
//     書かない）が合わないと upgrade をしない
//   - `Origin` があれば自分のオリジンと一致すること（無ければ通す）
//   - 送り返す `error` の理由は定型文だけ（会話の内容を混ぜない）

import { type IncomingMessage, type Server } from "node:http"
import { type Duplex } from "node:stream"

import { type RawData, WebSocketServer } from "ws"

import { type ClientCommand, parseClientCommand } from "../../shared/command.ts"
import { FRAME_ERROR_REASON, type ServerFrame } from "../../shared/frame.ts"
import { SESSION_SOCKET_PATH, SESSION_TOKEN_QUERY_NAME } from "../../shared/session-socket.ts"
import { type DispatchResult } from "../core/driver-command.ts"

/**
 * 受け取るメッセージ1件の上限（バイト）。**1件の依頼に添えられる画像（原寸 5 MiB × 2 枚）を
 * data URL で運べる大きさ**にしてある（内訳: 原寸2枚の base64 ≒ 13.33 MiB ＋ 控え2枚
 * ≒ 0.34 MiB ＋ 文面 20,000 文字で約 13.7 MiB。`docs/requirements.md` 4.10 の表）。
 *
 * **依頼の文面の上限はこれとは別に効いている**（zod の `MAX_PROMPT_TEXT_LENGTH`。
 * `src/shared/command.ts`）ので、ここを上げても送れる文面は長くならない。
 */
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024

export type SessionSocketOptions = {
  /** listen 済みの HTTP サーバ（`server.ts` の `startViewServer` が立てたもの）。 */
  readonly httpServer: Server
  readonly token: string
  /** 自分のオリジン（`http://127.0.0.1:<port>`）。`Origin` ヘッダの照合に使う。 */
  readonly origin: string
  /** 接続を購読に加える（`session-manager` の `subscribe`）。外すための関数を返す契約。 */
  readonly subscribe: (send: (frame: ServerFrame) => void) => () => void
  /** コマンドを渡す（`session-manager` の `dispatch`）。 */
  readonly dispatch: (command: ClientCommand) => Promise<DispatchResult>
}

export type SessionSocket = {
  /** upgrade の受け口を外し、開いている接続を閉じる。 */
  readonly close: () => void
}

/**
 * HTTP サーバに WebSocket の受け口を足す。**listen はしない**（呼び出し側が済ませている）。
 *
 * 接続が確立したら `subscribe` に加わり、`hello` が1つ届いてから `events` が流れ始める
 * （順序を決めているのは `session-manager` 側）。
 */
export function attachSessionSocket(options: SessionSocketOptions): SessionSocket {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (!isAllowedUpgrade(request, options)) {
      // 理由は返さない（トークンの有無を探る手掛かりを増やさない）。
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
      socket.end()
      return
    }

    sockets.handleUpgrade(request, socket, head, (connection) => {
      sockets.emit("connection", connection, request)
    })
  }

  options.httpServer.on("upgrade", onUpgrade)

  sockets.on("connection", (connection) => {
    const send = (frame: ServerFrame): void => {
      if (connection.readyState === connection.OPEN) {
        connection.send(JSON.stringify(frame))
      }
    }

    const unsubscribe = options.subscribe(send)
    connection.on("message", (data: RawData) => {
      receive(data, send, options.dispatch)
    })
    connection.on("close", unsubscribe)
  })

  return {
    close: () => {
      options.httpServer.off("upgrade", onUpgrade)
      for (const connection of sockets.clients) {
        connection.terminate()
      }
      sockets.close()
    },
  }
}

/**
 * upgrade を通してよいか。**経路・起動トークン・`Origin` の3つ**を見る（docs/design.md 9章）。
 * `Origin` が無いとき（ブラウザ経由でない呼び出し）を通すのは、旧の POST と同じ規則。
 */
function isAllowedUpgrade(request: IncomingMessage, options: SessionSocketOptions): boolean {
  const url = new URL(request.url ?? "/", options.origin)
  if (url.pathname !== SESSION_SOCKET_PATH) {
    return false
  }
  if (url.searchParams.get(SESSION_TOKEN_QUERY_NAME) !== options.token) {
    return false
  }

  const origin = request.headers.origin
  return origin === undefined || origin === options.origin
}

/**
 * 届いたメッセージ1件をコマンドとして受け取る。**読めない・受け付けられないときは定型文の
 * `error` を返す**（届いた値を理由に混ぜない。docs/coding-standards.md「会話内容の扱い」）。
 */
function receive(
  data: RawData,
  send: (frame: ServerFrame) => void,
  dispatch: (command: ClientCommand) => Promise<DispatchResult>,
): void {
  const command = parseClientCommand(decodeJson(data))
  if (command === undefined) {
    send({ type: "error", commandId: undefined, reason: FRAME_ERROR_REASON.invalidCommand })
    return
  }

  dispatch(command)
    .then((result) => {
      if (!result.ok) {
        send({ type: "error", commandId: command.commandId, reason: result.reason })
      }
    })
    .catch(() => {
      send({ type: "error", commandId: command.commandId, reason: FRAME_ERROR_REASON.driverFailed })
    })
}

/** WebSocket の1メッセージを JSON として読む。読めなければ undefined（呼び出し側が弾く）。 */
function decodeJson(data: RawData): unknown {
  try {
    return JSON.parse(messageText(data))
  } catch {
    return undefined
  }
}

/** `ws` が渡してくる3つの形（Buffer / Buffer の並び / ArrayBuffer）を文字列にする。 */
function messageText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8")
  }
  return Buffer.isBuffer(data)
    ? data.toString("utf8")
    : Buffer.from(new Uint8Array(data)).toString("utf8")
}
