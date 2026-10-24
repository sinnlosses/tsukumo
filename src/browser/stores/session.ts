// サーバから届く姿（`SessionState`）と、サーバへコマンドを送る口を持つ store。
// 部品は `useSession((session) => session.state.turn)` のように自分が読む値だけを購読する。
// サーバは 100ms ごとにフレームを押すので、姿ごと読むとターンが流れている間は毎秒10回描き直しになる。

import { createORPCClient, ORPCError } from "@orpc/client"
import { useEffect } from "react"
import { isPlainObject } from "remeda"
import { create } from "zustand"

import type { CommandRefusalReason } from "../../shared/command.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../shared/frame.ts"
import type { CommandClient } from "../../shared/rpc.ts"
import type { StampedEvent } from "../../shared/session/session-event.ts"
import { applySessionEvent } from "../../shared/session/session-fold.ts"
import {
  INITIAL_SESSION_STATE,
  restartRefused,
  type SessionState,
} from "../../shared/session/session-state.ts"
import { SESSION_SOCKET_PATH } from "../../shared/view-server/session-socket.ts"
import { invalidateAchievement } from "../domain/achievement-cache.ts"
import { applyRefresh } from "../domain/refresh.ts"
import { sessionTokenUrl } from "../domain/session-token-url.ts"
import { type CommandLink, connectSessionSocket, type ConnectionStatus } from "../lib/socket.ts"

/**
 * コマンドを送る口。契約（`commandContract`）から導いた型付きの client で、`dispatch.session.prompt({ text, images })` のように手続きの名前を辿って呼ぶ。
 * 参照が変わらないので、これしか読まない部品は姿の変化で描き直されない。
 *
 * 送りっぱなしで、失敗しても投げない（戻り値の Promise は待たなくてよい）。
 * 断られたこと（契約の `REFUSED`）は画面に出さない（画面は同じ条件で先に操作子を塞いでいて、結果はイベントで戻ってくる）。
 */
export type SessionDispatch = CommandClient

/**
 * 手続きの結果を待つ呼び出し専用の送り口。型は {@link SessionDispatch} と同じ。
 * 断られたとき（契約の `REFUSED`）・接続が切れたとき・繋がっていないときは握りつぶさず reject する。
 */
type AwaitedDispatch = CommandClient

/** コマンドの送り先。`connectSessionSocket` の接続がそのまま満たす（閉じるのは store の関心ではない）。 */
type CommandSocket = {
  readonly commandLink: CommandLink
}

/**
 * サーバの `hello` が名乗った版が、このページの {@link PROTOCOL_VERSION} と合っているか。
 * `mismatched` の間は `events` を畳まない（形の違う記録を読むと、部品が無いはずのフィールドを読んで壊れる）。
 * 次の `hello` で合えば `compatible` に戻る。
 */
type ProtocolAgreement = "compatible" | "mismatched"

/**
 * store の中身。接続の状態（`connection`）と版の一致（`protocol`）はブラウザだけが持つので、`SessionState` には入れず同じ store に相乗りさせる。
 */
type SessionStoreState = {
  readonly state: SessionState
  readonly connection: ConnectionStatus
  /** 接続が一度切れてから、まだ `open` に戻っていないか。初回の接続中は false。 */
  readonly linkLost: boolean
  readonly protocol: ProtocolAgreement
  /** `hello`（姿の丸ごとの入れ替え）を受けた回数。姿の差が新しく起きたことかを見分けるのに使う。 */
  readonly generation: number
  readonly dispatch: SessionDispatch
  readonly dispatchAwaited: AwaitedDispatch
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
    linkLost: false,
    protocol: "compatible",
    generation: 0,
    // 送った手続きが断られた・接続が切れたときは黙って捨てる（`SessionDispatch`）。
    dispatch: createORPCClient({
      call: (path, input, options) =>
        (socket?.commandLink.call(path, input, options) ?? Promise.resolve(undefined)).catch(
          () => undefined,
        ),
    }),
    dispatchAwaited: createORPCClient({
      call: (path, input, options) =>
        socket === undefined
          ? Promise.reject(new Error("サーバに繋がっていない"))
          : socket.commandLink.call(path, input, options),
    }),
    receive: (frame) => {
      const current = get()
      if (frame.type === "hello" && frame.protocolVersion !== PROTOCOL_VERSION) {
        set({
          state: INITIAL_SESSION_STATE,
          protocol: "mismatched",
          generation: current.generation + 1,
        })
        return
      }
      if (frame.type === "hello" && current.protocol === "mismatched") {
        set({ state: frame.state, protocol: "compatible", generation: current.generation + 1 })
        return
      }
      if (current.protocol === "mismatched") {
        return
      }
      const state = applyFrame(current.state, frame)
      const generation = frame.type === "hello" ? current.generation + 1 : current.generation
      if (state === current.state && generation === current.generation) {
        return
      }
      set({ state, generation })
    },
    setConnection: (status) => {
      const current = get()
      const linkLost = status === "open" ? false : status === "closed" || current.linkLost
      if (status !== current.connection || linkLost !== current.linkLost) {
        set({ connection: status, linkLost })
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

/** 駆動を起こし直すコマンドを断る間かどうか（ターン進行中か、委譲先が動いている間）。 */
export function useRestartRefused(): boolean {
  return useSession((session) => restartRefused(session.state))
}

/** サーバと繋ぎ、届いたフレームを store へ流す。画面の根で1回だけ呼ぶ。 */
export function useSessionConnection(): void {
  useEffect(() => {
    const { receive, setConnection, attachSocket } = useSession.getState()
    const frames = batchByAnimationFrame(receive)
    const socket = connectSessionSocket(sessionTokenUrl(SESSION_SOCKET_PATH), {
      // `refresh` は状態ではなくブラウザへの指示なので、畳み込みに入れず手前で捌く（開発中だけ届く）。
      onFrame: (frame) => {
        if (frame.type === "refresh") {
          applyRefresh(frame.target)
          return
        }
        if (
          frame.type === "hello" ||
          (frame.type === "events" &&
            frame.events.some(({ event }) => event.kind === "diary-written"))
        ) {
          invalidateAchievement()
        }
        frames.push(frame)
      },
      onStatusChange: setConnection,
    })
    attachSocket(socket)
    return () => {
      socket.close()
      frames.cancel()
      attachSocket(undefined)
    }
  }, [])
}

/** `dispatchAwaited` の失敗が、その理由で断られたもの（契約の `REFUSED`）か。 */
export function isRefusedFor(error: unknown, reason: CommandRefusalReason): boolean {
  return (
    error instanceof ORPCError &&
    error.code === "REFUSED" &&
    isPlainObject(error.data) &&
    error.data.reason === reason
  )
}

type FrameBatch = {
  readonly push: (frame: ServerFrame) => void
  /** 溜めたフレームを渡さずに捨て、予約した呼び出しと `visibilitychange` の購読を外す。 */
  readonly cancel: () => void
}

/**
 * 届いた `events` を次の描画の手前（`requestAnimationFrame`）まで溜め、到着順につないだ1つの `events` にして `receive` へ渡す。
 * ページが隠れている間（`document.hidden`）は渡さずに溜め続け、表に戻った `visibilitychange` で1回にまとめて渡す
 * （隠れたタブでも `requestAnimationFrame` が呼ばれるホストがあるので、描画の手前でも隠れていれば渡さない）。
 * ただし答え待ちの変化（`pending-changed`）を含むフレームは、隠れていても溜めた分と合わせてすぐ渡す（裏のタブのタイトルに答え待ちの印を付けるため）。
 * `hello` は隠れていても溜めずにすぐ渡し、溜めていた `events` は捨てる（`hello` の姿がそれより新しい）。
 */
function batchByAnimationFrame(receive: (frame: ServerFrame) => void): FrameBatch {
  // 隠れている間は長く溜まるので、届くたびに写し直さず足していく。
  const queued: StampedEvent[] = []
  let scheduled: number | undefined = undefined
  const unschedule = (): void => {
    if (scheduled !== undefined) {
      cancelAnimationFrame(scheduled)
      scheduled = undefined
    }
  }
  const deliver = (): void => {
    unschedule()
    if (queued.length > 0) {
      receive({ type: "events", events: queued.splice(0) })
    }
  }
  const flush = (): void => {
    if (document.hidden) {
      unschedule()
      return
    }
    deliver()
  }
  document.addEventListener("visibilitychange", flush)
  return {
    push: (frame) => {
      if (frame.type !== "events") {
        unschedule()
        queued.splice(0)
        receive(frame)
        return
      }
      queued.push(...frame.events)
      if (!document.hidden) {
        scheduled ??= requestAnimationFrame(flush)
      } else if (frame.events.some(({ event }) => event.kind === "pending-changed")) {
        deliver()
      }
    },
    cancel: () => {
      unschedule()
      queued.splice(0)
      document.removeEventListener("visibilitychange", flush)
    },
  }
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
