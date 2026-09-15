// サーバの WebSocket（`/ws?t=<token>`）へつなぎ、届いたフレームを封筒だけ検証してから渡す
// （docs/design.md 6.1 / 6.2「接続・再接続・フレームの zod 検証」）。**core を import しない**
// （原則2/3。`ui` が触れる契約は `protocol` だけ）。`/ws` の経路名・トークンのクエリ名の値は
// `protocol/session-socket.ts` が正典で、`core/server.ts` と両方から import する（値の再掲は
// しない）。
//
// 接続が切れたら、間隔を指数的に伸ばしながら再接続する。読めないフレームは黙って捨てて
// 次のフレームを待つ（`docs/coding-standards.md`「常駐プロセスは描画1回の失敗で落ちない」と
// 同じ考え方をブラウザ側でも取る）。

import { parseServerFrame, type ServerFrame } from "../protocol/frame.ts"
import { SESSION_SOCKET_PATH, SESSION_TOKEN_QUERY_NAME } from "../protocol/session-socket.ts"

const RECONNECT_INITIAL_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 8000

export type ConnectionStatus = "connecting" | "open" | "closed"

export type SessionSocket = {
  /** コマンド1件を送る。接続していない間は黙って捨てる（呼び出し側は状態を見て判断する）。 */
  readonly send: (command: unknown) => void
  /** 再接続をやめて閉じる。 */
  readonly close: () => void
}

export type SessionSocketHandlers = {
  readonly onFrame: (frame: ServerFrame) => void
  readonly onStatusChange: (status: ConnectionStatus) => void
}

/** 今のページの URL から `/ws?t=<token>` を組み立てて繋ぎ、切れたら再接続し続ける。 */
export function connectSessionSocket(handlers: SessionSocketHandlers): SessionSocket {
  let socket: WebSocket | undefined = undefined
  let closed = false
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const connect = (): void => {
    handlers.onStatusChange("connecting")
    const opened = new WebSocket(socketUrl())
    socket = opened

    opened.addEventListener("open", () => {
      reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
      handlers.onStatusChange("open")
    })
    opened.addEventListener("message", (event: MessageEvent<unknown>) => {
      const frame = parseServerFrame(safeParseJson(event.data))
      if (frame !== undefined) {
        handlers.onFrame(frame)
      }
    })
    opened.addEventListener("close", () => {
      handlers.onStatusChange("closed")
      if (closed) {
        return
      }
      reconnectTimer = setTimeout(connect, reconnectDelayMs)
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS)
    })
  }

  connect()

  return {
    send: (command) => {
      if (socket !== undefined && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(command))
      }
    },
    close: () => {
      closed = true
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer)
      }
      socket?.close()
    },
  }
}

function socketUrl(): string {
  const here = new URL(window.location.href)
  const token = here.searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  const protocol = here.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${here.host}${SESSION_SOCKET_PATH}?${SESSION_TOKEN_QUERY_NAME}=${encodeURIComponent(token)}`
}

/** WebSocket のメッセージ（文字列のはず）を JSON として読む。読めなければ undefined。 */
function safeParseJson(data: unknown): unknown {
  if (typeof data !== "string") {
    return undefined
  }
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}
