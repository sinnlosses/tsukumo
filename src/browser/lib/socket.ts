// サーバの WebSocket（`/ws?t=<token>`）へつなぎ、届いたフレームを封筒だけ検証してから渡す
// （docs/design.md 6.1 / 6.2「接続・再接続・フレームの zod 検証」）。**core を import しない**
// （原則2/3。`browser` が触れる契約は `shared` だけ）。`/ws` の経路名・トークンのクエリ名の値は
// `shared/session-socket.ts` が正典で、`adapter/session-socket.ts` と両方から import する（値の再掲は
// しない）。経路にトークンを足す口は `lib/session-token-url.ts` に寄せてあり、ここは
// `ws:` / `wss:` とホストの組み立てだけを持つ。
//
// 接続が切れたら、間隔を指数的に伸ばしながら再接続する。読めないフレームは黙って捨てて
// 次のフレームを待つ（`docs/coding-standards.md`「常駐プロセスは描画1回の失敗で落ちない」と
// 同じ考え方をブラウザ側でも取る）。
//
// **1本の接続に、押し出しのフレームとコマンドの手続きの応答が相乗りしている**
// （`src/server/view-server/adapter/session-socket.ts`）。届いたものは**ここで振り分け**、フレームは
// `onFrame` へ、手続きの応答（oRPC の封筒。`i` を持つ）だけを `RPCLink` へ渡す——フレームを渡すと
// `RPCLink` が読めずに投げる。

import { type ClientContext, type ClientLink } from "@orpc/client"
import { RPCLink } from "@orpc/client/websocket"
import { isPlainObject } from "remeda"

import { parseServerFrame, type ServerFrame } from "../../shared/frame.ts"
import { SESSION_SOCKET_PATH } from "../../shared/session-socket.ts"
import { sessionTokenUrl } from "./session-token-url.ts"

const RECONNECT_INITIAL_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 8000

export type ConnectionStatus = "connecting" | "open" | "closed"

/** コマンドの手続きを送る口（oRPC の link。型付きの client は `stores/session.tsx` が作る）。 */
export type CommandLink = ClientLink<ClientContext>

export type SessionSocket = {
  /**
   * コマンドの手続きを送る口。**繋ぎ直しても同じもの**で、その時点の接続へ送る。接続していない
   * 間は送らずに捨てる（呼び出し側は状態を見て判断する）。
   */
  readonly commandLink: CommandLink
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
  // いまの接続の上の手続きの口と、そこへ応答を渡す入れ物（接続ごとに作り直す）。
  let command: { readonly link: CommandLink; readonly channel: CommandChannel } | undefined =
    undefined
  let closed = false
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const connect = (): void => {
    handlers.onStatusChange("connecting")
    const opened = new WebSocket(socketUrl())
    socket = opened
    const channel = new CommandChannel(opened)
    command = { link: new RPCLink({ websocket: channel }), channel }

    opened.addEventListener("open", () => {
      reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
      handlers.onStatusChange("open")
    })
    opened.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = safeParseJson(event.data)
      const frame = parseServerFrame(message)
      if (frame !== undefined) {
        handlers.onFrame(frame)
        return
      }
      if (isCommandResponse(message)) {
        channel.dispatchEvent(new MessageEvent("message", { data: event.data }))
      }
    })
    opened.addEventListener("close", () => {
      // 応答を待っている手続きは、ここで諦めさせる（`RPCLink` が閉じたことを知る道はこれだけ）。
      channel.dispatchEvent(new Event("close"))
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
    commandLink: {
      call: (path, input, options) =>
        command !== undefined && socket !== undefined && socket.readyState === WebSocket.OPEN
          ? command.link.call(path, input, options)
          : Promise.resolve(undefined),
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
  const protocol = here.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${here.host}${sessionTokenUrl(SESSION_SOCKET_PATH)}`
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

/**
 * 手続きの応答か（oRPC の封筒は `i`〔要求の番号〕を持つ）。フレームでもこれでもないものは捨てる。
 */
function isCommandResponse(message: unknown): boolean {
  return isPlainObject(message) && "i" in message
}

/**
 * `RPCLink` に渡す接続の見かけ。**送るのは本物の接続へそのまま**、受け取るのは振り分けた
 * 手続きの応答だけ（`EventTarget` として `message` / `close` を流し直す）。
 */
class CommandChannel extends EventTarget {
  readonly #socket: WebSocket

  constructor(socket: WebSocket) {
    super()
    this.#socket = socket
  }

  get readyState(): WebSocket["readyState"] {
    return this.#socket.readyState
  }

  send(data: Parameters<WebSocket["send"]>[0]): void {
    this.#socket.send(data)
  }
}
