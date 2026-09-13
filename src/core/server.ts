// WebSocket の受け口（`GET /ws?t=<起動トークン>`）。**フレームとコマンドが通る唯一の経路**
// （docs/design.md 5章「server.ts」）。
//
// HTTP 側（ページ・`/assets`・`/vendor`）はまだ旧の src/infrastructure/view-server.ts が持っている。
// 段2 はそこに upgrade を1本足すだけで、経路は段3以降でこちらへ移る。
//
// **`Bun.serve` の WebSocket を使わない**（`ws` パッケージ。docs/coding-standards.md
// 「Bun固有APIに寄せない」）。
//
// 安全のための決まり（docs/design.md 9章）:
//   - バインド先は `127.0.0.1` だけ（listen するのは呼び出し側）
//   - **起動トークン**（起動ごとの乱数。ディスクに書かない）が合わないと upgrade しない
//   - `Origin` があれば自分のオリジンと一致すること（無ければ通す。旧の POST と同じ規則）
//   - 送り返す `error` の理由は定型文だけ（会話の内容を混ぜない）

import { randomBytes } from "node:crypto"
import { type IncomingMessage, type Server } from "node:http"
import { type Duplex } from "node:stream"

import { type RawData, WebSocketServer } from "ws"

import {
  type ClientCommand,
  MAX_PROMPT_TEXT_LENGTH,
  parseClientCommand,
} from "../protocol/command.ts"
import { FRAME_ERROR_REASON, type ServerFrame } from "../protocol/frame.ts"
import { type DispatchResult } from "./session-manager.ts"

/** WebSocket の経路。 */
export const SESSION_SOCKET_PATH = "/ws"

/** 起動トークンを載せるクエリの名前（`/ws?t=<token>`）。 */
export const SESSION_TOKEN_QUERY_NAME = "t"

/**
 * 受け取るメッセージ1件の上限（バイト）。依頼の文面の上限（{@link MAX_PROMPT_TEXT_LENGTH}）に
 * JSON と多バイト文字ぶんの余裕を持たせた素朴な上限。
 */
const MAX_MESSAGE_BYTES = MAX_PROMPT_TEXT_LENGTH * 4

/**
 * 起動トークンを1つ作る。**起動ごとに変わり、メモリにしか置かない**（ディスクに書かない。
 * docs/design.md 9章）。同じマシンの別プロセスが `127.0.0.1` を読めるという割り切りを塞ぐ。
 */
export function createStartupToken(): string {
  return randomBytes(24).toString("hex")
}

export type SessionSocketOptions = {
  /** listen 済みの HTTP サーバ（旧の view-server が立てたもの）。 */
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
