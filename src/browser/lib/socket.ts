// サーバの WebSocket（`/ws?t=<token>`）へつなぎ、届いたフレームを封筒だけ検証してから渡す。
// 経路とクエリは呼ぶ側から受け取り、ここは `ws:` / `wss:` とホストの組み立てだけを持つ。
//
// 接続が切れたら、間隔を指数的に伸ばしながら再接続する。読めないフレームは黙って捨てて次のフレームを待つ。
//
// 1本の接続の上は、すべて oRPC の手続き。
// 押し出しも、接続ごとに1回呼ぶ購読の手続き `frame.subscribe` の Event Iterator として届く。
// 購読が終わったら（投げても）接続を閉じて繋ぎ直す。
// つなぎ直した購読の最初の `hello` で状態を置き換えるので、途中の取りこぼしを気にしない。

import { type ClientContext, type ClientLink, createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/websocket"
import type { ContractRouterClient } from "@orpc/contract"

import type { frameContract } from "../../shared/contract/frame.ts"
import { parseServerFrame, type ServerFrame } from "../../shared/frame.ts"

const RECONNECT_INITIAL_DELAY_MS = 500
const RECONNECT_MAX_DELAY_MS = 8000

export type ConnectionStatus = "connecting" | "open" | "closed"

/** コマンドの手続きを送る口（oRPC の link）。 */
export type CommandLink = ClientLink<ClientContext>

export type SessionSocket = {
  /**
   * コマンドの手続きを送る口。繋ぎ直しても同じもので、その時点の接続へ送る。
   * 接続していない間は送らず、reject する。
   */
  readonly commandLink: CommandLink
  readonly close: () => void
}

export type SessionSocketHandlers = {
  readonly onFrame: (frame: ServerFrame) => void
  readonly onStatusChange: (status: ConnectionStatus) => void
}

/** 今のページのホストへ `socketPath`（クエリを含む相対パス）で繋ぎ、切れたら再接続し続ける。 */
export function connectSessionSocket(
  socketPath: string,
  handlers: SessionSocketHandlers,
): SessionSocket {
  let socket: WebSocket | undefined = undefined
  // いまの接続の上の手続きの口（接続ごとに作り直す）。
  let link: CommandLink | undefined = undefined
  let closed = false
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const connect = (): void => {
    handlers.onStatusChange("connecting")
    const opened = new WebSocket(socketUrl(socketPath))
    const openedLink = new RPCLink({ websocket: opened })
    socket = opened
    link = openedLink

    opened.addEventListener("open", () => {
      reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
      handlers.onStatusChange("open")
    })
    opened.addEventListener("close", () => {
      handlers.onStatusChange("closed")
      if (closed) {
        return
      }
      reconnectTimer = setTimeout(connect, reconnectDelayMs)
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS)
    })

    // 購読の要求は開くまで `RPCLink` が待ってから送る。
    void receiveFrames(openedLink, handlers.onFrame).finally(() => {
      opened.close()
    })
  }

  connect()

  return {
    commandLink: {
      call: (path, input, options) =>
        link !== undefined && socket !== undefined && socket.readyState === WebSocket.OPEN
          ? link.call(path, input, options)
          : Promise.reject(new Error("サーバに繋がっていない")),
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

function socketUrl(path: string): string {
  const here = new URL(window.location.href)
  const protocol = here.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${here.host}${path}`
}

/**
 * 接続の上で `frame.subscribe` を購読し、読めたフレームを渡し続ける。
 * 購読が終わるか投げたら戻る（接続が切れた・サーバが購読を閉じた）。読めないフレームはその1つだけ捨てる。
 */
async function receiveFrames(
  link: CommandLink,
  onFrame: (frame: ServerFrame) => void,
): Promise<void> {
  const client: ContractRouterClient<{ readonly frame: typeof frameContract }> =
    createORPCClient(link)
  try {
    for await (const value of await client.frame.subscribe()) {
      const frame = parseServerFrame(value)
      if (frame !== undefined) {
        onFrame(frame)
      }
    }
  } catch {
    // 切れたときの中断（`AbortError`）もここへ来る。繋ぎ直すのは呼び出し側。
  }
}
