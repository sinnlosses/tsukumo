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
// **1本の接続の上は、すべて oRPC の手続き**（`src/server/view-server/adapter/session-socket.ts`）。
// 押し出しも、接続ごとに1回呼ぶ購読の手続き `frame.subscribe` の Event Iterator として届く。
// **購読が終わったら（投げても）接続を閉じて繋ぎ直す**——つなぎ直した購読の最初の `hello` で
// 状態を置き換えるので、途中の取りこぼしを気にしない（docs/design.md 3章「再接続」）。

import { type ClientContext, type ClientLink, createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/websocket"
import { type ContractRouterClient } from "@orpc/contract"

import { type frameContract } from "../../shared/contract/frame.ts"
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
  // いまの接続の上の手続きの口（接続ごとに作り直す）。
  let link: CommandLink | undefined = undefined
  let closed = false
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const connect = (): void => {
    handlers.onStatusChange("connecting")
    const opened = new WebSocket(socketUrl())
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

/**
 * 接続の上で `frame.subscribe` を購読し、読めたフレームを渡し続ける。**購読が終わるか投げたら
 * 戻る**（接続が切れた・サーバが購読を閉じた）。読めないフレームはその1つだけ捨てる。
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
