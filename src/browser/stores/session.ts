// サーバから届く姿（`SessionState`）と、サーバへコマンドを送る口を持つ store。
// 部品は `useSession((session) => session.state.turn)` のように自分が読む値だけを購読する——
// サーバは 100ms ごとにフレームを押すので、姿ごと読むとターンが流れている間は毎秒10回描き直しになる。

import { createORPCClient } from "@orpc/client"
import { startTransition, useEffect } from "react"
import { create } from "zustand"

import { PROTOCOL_VERSION, type ServerFrame } from "../../shared/frame.ts"
import type { CommandClient } from "../../shared/rpc.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../shared/session/session-state.ts"
import { SESSION_SOCKET_PATH } from "../../shared/view-server/session-socket.ts"
import { applyRefresh } from "../domain/refresh.ts"
import { sessionTokenUrl } from "../domain/session-token-url.ts"
import { type CommandLink, connectSessionSocket, type ConnectionStatus } from "../lib/socket.ts"

/**
 * コマンドを送る口。契約（`commandContract`）から導いた型付きの client
 * で、`dispatch.session.prompt({ text, images })` のように手続きの名前を辿って呼ぶ。参照が
 * 変わらないので、これしか読まない部品は姿の変化で描き直されない。
 *
 * 送りっぱなしで、失敗しても投げない（戻り値の Promise は待たなくてよい）。断られたこと
 * （契約の `REFUSED`）は画面に出さない——画面は同じ条件で先に操作子を塞いでいて、結果はイベントで
 * 戻ってくる。
 */
export type SessionDispatch = CommandClient

/** コマンドの送り先。`connectSessionSocket` の接続がそのまま満たす（閉じるのは store の関心ではない）。 */
export type CommandSocket = {
  readonly commandLink: CommandLink
}

/**
 * サーバの `hello` が名乗った版が、このページの {@link PROTOCOL_VERSION} と合っているか
 * （`docs/design.md`「ServerFrame」）。`mismatched` の間は `events` を畳まない——形の違う記録を読むと、
 * 部品が無いはずのフィールドを読んで壊れる（起こし直さずに画面だけ組み直したときに起きる）。
 * 次の `hello` で合えば `compatible` に戻る。
 */
export type ProtocolAgreement = "compatible" | "mismatched"

/**
 * store の中身。接続の状態（`connection`）と版の一致（`protocol`）はブラウザだけが持つので
 * `SessionState` には入れず、同じ store に相乗りさせる。`connection` はまだ画面には出していない。
 */
export type SessionStoreState = {
  readonly state: SessionState
  readonly connection: ConnectionStatus
  readonly protocol: ProtocolAgreement
  readonly dispatch: SessionDispatch
  /** 届いたフレームを畳む。`refresh` は姿を動かさないので呼び出し側が手前で捌く。 */
  readonly receive: (frame: ServerFrame) => void
  readonly setConnection: (status: ConnectionStatus) => void
  /** いま繋がっている接続を持たせる（切れたら undefined）。`dispatch` の送り先。 */
  readonly attachSocket: (socket: CommandSocket | undefined) => void
}

export const useSession = create<SessionStoreState>()((set, get) => {
  // 繋ぎ直しで入れ替わるが、`dispatch` の参照は変えたくないので閉包に持つ。
  let socket: CommandSocket | undefined = undefined
  return {
    state: INITIAL_SESSION_STATE,
    connection: "connecting",
    protocol: "compatible",
    // 送った手続きが断られた・接続が切れたときは黙って捨てる（`SessionDispatch`）。
    dispatch: createORPCClient({
      call: (path, input, options) =>
        (socket?.commandLink.call(path, input, options) ?? Promise.resolve(undefined)).catch(
          () => undefined,
        ),
    }),
    receive: (frame) => {
      const current = get()
      if (frame.type === "hello" && frame.protocolVersion !== PROTOCOL_VERSION) {
        set({ state: INITIAL_SESSION_STATE, protocol: "mismatched" })
        return
      }
      if (frame.type === "hello" && current.protocol === "mismatched") {
        set({ state: frame.state, protocol: "compatible" })
        return
      }
      if (current.protocol === "mismatched") {
        return
      }
      const state = applyFrame(current.state, frame)
      if (state === current.state) {
        return
      }
      // 答え待ち（許可要求・質問）が動いたフレームだけ緊急にする。人が待っている箱なので
      // 遅らせない。レポートやツールの進行は毎秒10回届くので、入力欄の操作を優先できるよう
      // トランジションに載せる。React は外部の store（zustand も `useSyncExternalStore`）の描き直しを
      // 同期レーンで走らせる（`forceStoreRerender`）ので、入力欄との競合にいま効いているのは
      // 購読の絞り込み（セレクタ）のほう。緊急かどうかの境目はここ1箇所に置く。
      if (state.pending !== current.state.pending) {
        set({ state })
        return
      }
      startTransition(() => {
        set({ state })
      })
    },
    setConnection: (status) => {
      if (status !== get().connection) {
        set({ connection: status })
      }
    },
    attachSocket: (next) => {
      socket = next
    },
  }
})

/** ターンが進行中かどうか。 */
export function useTurnRunning(): boolean {
  return useSession((session) => session.state.turn.kind === "running")
}

/** サーバと繋ぎ、届いたフレームを store へ流す。画面の根で1回だけ呼ぶ。 */
export function useSessionConnection(): void {
  useEffect(() => {
    const { receive, setConnection, attachSocket } = useSession.getState()
    const socket = connectSessionSocket(sessionTokenUrl(SESSION_SOCKET_PATH), {
      // `refresh` は状態ではなくブラウザへの指示なので、畳み込みに入れず手前で捌く
      // （開発中だけ届く。`docs/design.md`「ビルドと依存」）。
      onFrame: (frame) => {
        if (frame.type === "refresh") {
          applyRefresh(frame.target)
          return
        }
        receive(frame)
      },
      onStatusChange: setConnection,
    })
    attachSocket(socket)
    return () => {
      socket.close()
      attachSocket(undefined)
    }
  }, [])
}

function applyFrame(state: SessionState, frame: ServerFrame): SessionState {
  if (frame.type === "hello") {
    return frame.state
  }
  if (frame.type === "events") {
    return frame.events.reduce(
      (next, stamped) => applySessionEvent(next, stamped.event, stamped.at),
      state,
    )
  }
  // "refresh" はここまで来ない（状態を動かさないので、`useSessionConnection` が手前で捌く）。
  return state
}
