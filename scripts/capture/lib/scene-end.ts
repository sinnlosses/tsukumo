// 撮影の道具が、疑似セッションの場面が画面へ流れ終わるのを待つための部品。
// 画面の WebSocket が受けた `events` フレームを数え、場面の手（`startupSteps`）が出す件数に届いたら終わりとする。

import {
  type FakeSession,
  type FakeSessionStep,
  startupSteps,
} from "../../../src/server/session-driver/adapter/fake-session.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import type { Settle } from "./catalog-entry.ts"
import { countEventKinds } from "./event-kind-count.ts"

/** 場面の猶予（ミリ秒）。最後の手が流れる時刻に足す、起動と描画の余裕。 */
const SCENE_END_GRACE_MS = 10_000

/** `kind` のイベントが何件目まで届けば足りるか。 */
export type SceneEventTarget = {
  readonly kind: SessionEvent["kind"]
  readonly occurrence: number
}

/** 場面の最後の手の `kind` と、その `kind` の（数える）手の総数。数える手が無ければ undefined。 */
export function sceneEndTarget(
  session: FakeSession,
  scene: string,
  until: number | undefined,
): SceneEventTarget | undefined {
  const steps = countedSteps(session, scene, until)
  const last = steps.at(-1)
  if (last === undefined) {
    return undefined
  }
  const kind = last.event.kind
  return { kind, occurrence: steps.filter((step) => step.event.kind === kind).length }
}

/**
 * カタログの件の `settle` が待つ場面の手。`scene-event` は指した手、`scene-end` と、場面の終わりを
 * 待つ `selector` の件は場面の最後の手。場面に数える手が無ければ undefined。
 */
export function settleSceneTarget(
  settle: Settle,
  session: FakeSession,
  scene: string,
): SceneEventTarget | undefined {
  return settle.kind === "scene-event"
    ? { kind: settle.eventKind, occurrence: settle.occurrence }
    : sceneEndTarget(session, scene, undefined)
}

/**
 * 件の `windowIndex` 枚目の窓を撮るときの場面の扱い。場面は最初のビューが繋がったときに流れ始める。
 * 終わりまで待つ件は、最初の窓で流れ終わるので2枚目以降は待たない。途中の手を待つ件は、2枚目を開く
 * 時点でも場面が流れている途中で、窓の状態が前の窓の撮影にかかった時間で変わるので、窓ごとに場面を
 * 起こし直して同じ手を待つ。
 */
export function sceneWindowPlan(
  settle: Settle,
  windowIndex: number,
): { readonly relaunches: boolean; readonly waits: boolean } {
  return settle.kind === "scene-event"
    ? { relaunches: windowIndex > 0, waits: true }
    : { relaunches: false, waits: windowIndex === 0 }
}

/**
 * `target` の手が流れる時刻に猶予を足した、待つ上限（ミリ秒）。
 * 場面の中に `target` の手が無ければ undefined。
 */
export function sceneEventTimeoutMs(
  session: FakeSession,
  scene: string,
  until: number | undefined,
  target: SceneEventTarget,
): number | undefined {
  const step = countedSteps(session, scene, until)
    .filter((candidate) => candidate.event.kind === target.kind)
    .at(target.occurrence - 1)
  return step === undefined ? undefined : step.afterMs + SCENE_END_GRACE_MS
}

/** `watchSceneEvents` が使う `Page` の一部（偽物を渡せるようにしている）。 */
export type WatchedPage = {
  readonly on: (
    event: "websocket",
    handler: (socket: {
      readonly on: (
        event: "framereceived",
        handler: (frame: { readonly payload: string | Buffer }) => void,
      ) => unknown
    }) => void,
  ) => unknown
}

export type SceneEventWatch = {
  /** `target` の件数に届くまで待つ。上限まで届かなければ、場面名と届いた件数を載せて投げる。 */
  readonly waitFor: (
    target: SceneEventTarget,
    options: { readonly scene: string; readonly timeoutMs: number },
  ) => Promise<void>
}

/**
 * ページが受ける `events` フレームを数え始める。接続は遷移の途中で開くので、`page.goto` より前に呼ぶ
 * （呼んだあとに開いた接続のフレームだけを数える）。
 */
export function watchSceneEvents(page: WatchedPage): SceneEventWatch {
  const counts = new Map<SessionEvent["kind"], number>()
  const listeners = new Set<() => void>()
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      for (const [kind, count] of countEventKinds(
        typeof payload === "string" ? payload : payload.toString("utf8"),
      )) {
        counts.set(kind, (counts.get(kind) ?? 0) + count)
      }
      for (const listener of listeners) {
        listener()
      }
    })
  })
  return {
    waitFor: (target, options) => {
      const reached = (): boolean => (counts.get(target.kind) ?? 0) >= target.occurrence
      return new Promise<void>((resolve, reject) => {
        if (reached()) {
          resolve()
          return
        }
        const finish = (): void => {
          clearTimeout(timer)
          listeners.delete(check)
        }
        const check = (): void => {
          if (reached()) {
            finish()
            resolve()
          }
        }
        const timer = setTimeout(() => {
          finish()
          reject(
            new Error(
              `場面の終わりが届かなかった: ${options.scene}（${target.kind} を ${String(target.occurrence)} 件待った・${String(counts.get(target.kind) ?? 0)} 件・上限 ${String(options.timeoutMs)}ms）`,
            ),
          )
        }, options.timeoutMs)
        listeners.add(check)
      })
    },
  }
}

/**
 * 数える手。`afterMs` が 0 の手は最初のビューが繋がった直後に流れ、`hello` の状態に畳まれて
 * `events` フレームとして届かないことがあるので数えない。
 */
function countedSteps(
  session: FakeSession,
  scene: string,
  until: number | undefined,
): readonly FakeSessionStep[] {
  return startupSteps(session, scene, until).filter((step) => step.afterMs > 0)
}
