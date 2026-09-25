// 押し出し（フレーム）の購読とコマンドの手続きが通る WebSocket の境界（`GET /ws?t=<起動トークン>`）。
// **ページと素材を配る HTTP は別の境界**（`server.ts`。ここは `listen` 済みのサーバに upgrade の
// 受け口を足すだけで、自分では listen しない）。
//
// **1本の接続の上は、すべて oRPC の手続きの要求と応答**（`RPCHandler`。束ねたルータは配線の
// `src/router.ts` の `createSocketRouter`）。押し出しもブラウザが呼ぶ購読の手続き（`frame.subscribe`）
// の Event Iterator として流れ、購読の元（`subscribe`）は接続の context に載せる。
//
// **`Bun.serve` の WebSocket には寄せない**（`ws` パッケージ。docs/coding-standards.md
// 「Bun固有APIに寄せない」）。
//
// 安全のための決まり（docs/design.md 9章）:
//   - **起動トークン**（`server.ts` の `createStartupToken`。起動ごとの乱数で、ディスクに
//     書かない）が合わないと upgrade をしない
//   - `Origin` があれば自分のオリジンと一致すること（無ければ通す）
//   - 断るときの理由は定型文だけ（会話の内容を混ぜない）。読めないメッセージは中身をどこにも
//     出さずに捨てる

import { type IncomingMessage, type Server } from "node:http"
import { type Duplex } from "node:stream"

import { type Router } from "@orpc/server"
import { RPCHandler } from "@orpc/server/websocket"
import { type RawData, WebSocketServer } from "ws"

import { type socketContract } from "../../../shared/rpc.ts"
import { SESSION_SOCKET_PATH, SESSION_TOKEN_QUERY_NAME } from "../../../shared/session-socket.ts"
import { type CommandSession } from "../../session/core/command-session.ts"
import { type SubscribeFrames } from "./frame-procedure.ts"
import { rpcContextOf, type SocketRpcContext } from "./rpc-guard.ts"

/**
 * 受け取るメッセージ1件の上限（バイト）。**1件の依頼に添えられる画像（原寸 5 MiB × 2 枚）を
 * data URL で運べる大きさ**にしてある（内訳: 原寸2枚の base64 ≒ 13.33 MiB ＋ 控え2枚
 * ≒ 0.34 MiB ＋ 文面 20,000 文字で約 13.7 MiB。`docs/requirements.md` 4.10 の表）。
 *
 * **依頼の文面の上限はこれとは別に効いている**（zod の `MAX_PROMPT_TEXT_LENGTH`。
 * `src/shared/contract/session.ts`）ので、ここを上げても送れる文面は長くならない。
 */
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024

export type SessionSocketOptions = {
  /** listen 済みの HTTP サーバ（`server.ts` の `startViewServer` が立てたもの）。 */
  readonly httpServer: Server
  readonly token: string
  /** 自分のオリジン（`http://127.0.0.1:<port>`）。`Origin` ヘッダの照合に使う。 */
  readonly origin: string
  /** 押し出しの購読の元（`session-manager` の `subscribe`）。手続き `frame.subscribe` が読む。 */
  readonly subscribe: SubscribeFrames
  /** `/ws` の手続きを束ねたルータ（配線の `src/router.ts` の `createSocketRouter`）。 */
  readonly socketRouter: SocketRouter
  /** 手続きの context に載せるセッションの口（`session-manager` の `commandSession`）。 */
  readonly commandSession: CommandSession
}

/** `/ws` に載せるルータ（コマンドと押し出しの購読）。 */
export type SocketRouter = Router<typeof socketContract, SocketRpcContext>

export type SessionSocket = {
  /** upgrade の受け口を外し、開いている接続を閉じる。 */
  readonly close: () => void
}

/**
 * HTTP サーバに WebSocket の受け口を足す。**listen はしない**（呼び出し側が済ませている）。
 *
 * 接続しただけでは購読に加わらない。ブラウザが `frame.subscribe` を呼ぶと、`hello` が1つ届いてから
 * `events` が流れ始める（順序を決めているのは `session-manager` 側）。接続が切れると oRPC が
 * 手続きの `signal` を中断し、購読が外れる。
 */
export function attachSessionSocket(options: SessionSocketOptions): SessionSocket {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  const procedures = new RPCHandler(options.socketRouter)

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

  sockets.on("connection", (connection, request: IncomingMessage) => {
    // 照合の材料は upgrade の要求から写す（手続きの前のミドルウェア `rpc-guard.ts` がもう一度見る）。
    const context: SocketRpcContext = {
      ...rpcContextOf(request, { startupToken: options.token, serverOrigin: options.origin }),
      session: options.commandSession,
      subscribe: options.subscribe,
    }

    connection.on("message", (data: RawData) => {
      // **読めないメッセージ（手続きの要求の形でないもの）は黙って捨てる。** 受け口の既定
      // （`upgrade`）は投げたものを `console.error` へ出し、JSON の読み違いの理由には届いた文面の
      // 断片が入りうる（`docs/coding-standards.md`「会話内容の扱い」）。
      procedures.message(connection, messageText(data), { context }).catch(() => {})
    })
    connection.on("close", () => {
      procedures.close(connection)
    })
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

/** `ws` が渡してくる3つの形（Buffer / Buffer の並び / ArrayBuffer）を文字列にする。 */
function messageText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8")
  }
  return Buffer.isBuffer(data)
    ? data.toString("utf8")
    : Buffer.from(new Uint8Array(data)).toString("utf8")
}
