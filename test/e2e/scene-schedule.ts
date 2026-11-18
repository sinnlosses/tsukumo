// 疑似セッションの予定（`startupSteps`）から決まる待ちと検査。

import { countBy } from "remeda"

import {
  type FakeSessionStep,
  startupSteps,
} from "../../src/server/session-driver/adapter/fake/fake-session.ts"
import { bundledFakeSession } from "../fixture/bundled-fake-session.ts"
import { asRecord, type MessageRecord } from "./message-record.ts"

/**
 * 疑似セッションの予定の上で、シナリオがいまどの手まで届いたと見なせるか。
 * 位置は予定の時刻と待った手だけから決まり、走らせる速さに依らない。
 */
export type SceneProgress = {
  /** `kind` の手の `occurrence` 回目まで届いた。予定に無い手（UI の操作で生まれる手など）なら位置を変えない。 */
  readonly reach: (kind: string, occurrence: number) => void
  /** `id` の札を載せた `pending-changed` まで届いた。予定に無ければ位置を変えない。 */
  readonly reachPending: (id: string) => void
  /**
   * いまの位置から予定の次の手まで `MIN_NEXT_STEP_GAP_MS` 以上空いていることを確かめる。
   * 次の手が画面を触る・撮るあいだに届くと、触った結果や撮った DOM・messages が着順で揺れる。
   * `act` は落ちたときの文に入れる、何をしようとしたか。
   */
  readonly assertRoomToAct: (scenario: string, act: string) => void
}

/**
 * fake driver が流し始める予定（`startupSteps`）を読み、最初の静かな区切りまでの手が
 * 種別ごとの回数ですべて届くまで待つ。区切りは予定の時刻だけから決まり、走らせる速さに依らない。
 */
export async function waitForQuietPoint(messages: MessageRecord, scene: string): Promise<void> {
  const steps = startupSteps(bundledFakeSession(), scene, undefined)
  const counts = countBy(steps.slice(0, quietPointIndex(steps) + 1), (step) => step.event.kind)
  for (const [kind, count] of Object.entries(counts)) {
    await messages.waitForEvent(kind, count)
  }
}

/**
 * `open` が部屋を渡した時点（最初の静かな区切り）から始まる位置。
 * 待った手が区切りより前の手でも、渡した時点で区切りまで届いているので、位置は区切りより前へ戻さない。
 * `scene: "none"` は依頼のたびに `turns[]` から動的に選ばれる場面なので、位置を持たず検査もしない
 * （fake driver の `playNextTurn`）。
 */
export function sceneProgress(scene: string): SceneProgress {
  if (scene === "none") {
    return {
      reach: () => undefined,
      reachPending: () => undefined,
      assertRoomToAct: () => undefined,
    }
  }
  const ordered = startupSteps(bundledFakeSession(), scene, undefined)
  let position = quietPointIndex(ordered)
  const moveTo = (index: number): void => {
    if (index >= 0) {
      position = Math.max(position, index)
    }
  }
  return {
    reach: (kind, occurrence) => {
      moveTo(nthIndex(ordered, occurrence, (step) => step.event.kind === kind))
    },
    reachPending: (id) => {
      moveTo(nthIndex(ordered, 1, (step) => carriesPending(step, id)))
    },
    assertRoomToAct: (scenario, act) => {
      const step = ordered[position]
      const next = ordered[position + 1]
      if (step === undefined || next === undefined) {
        return
      }
      const gap = gapToNext(step, next)
      if (gap < MIN_NEXT_STEP_GAP_MS) {
        throw new Error(
          `${scenario}（場面 ${scene}）は、${act}位置（予定の${String(position)}番目の手 ${step.event.kind}）から次の手（${next.event.kind}）まで ${String(gap)}ms しかない（${String(MIN_NEXT_STEP_GAP_MS)}ms 要る）。次の手を後ろへずらした場面にするか、間合いのある手まで waitForEvent で待ってから触る`,
        )
      }
    },
  }
}

/**
 * 疑似セッションの予定で、次の手までこれ以上空いた時点を静かな区切りと見なす。
 * `open` は最初の区切りまでの手を待つので、渡したあとの操作が場面のタイマーと競わない。
 * 場面の中の手の間隔（`fixture/fake-session/` では 100ms 刻み）より長く、場面の区切り以下にする。
 */
const QUIET_GAP_MS = 500

/**
 * 画面を触る・撮る位置から、疑似セッションの予定の次の手までに要る最小の間合い（ミリ秒）。
 * 負荷の高い回でも、触り終える・撮り終える前に次の手が届かない長さにする。
 */
const MIN_NEXT_STEP_GAP_MS = 3000

/** 時刻の順の予定で、次の手まで `QUIET_GAP_MS` 以上空く最初の手の位置。 */
function quietPointIndex(steps: readonly FakeSessionStep[]): number {
  return steps.findIndex((step, index) => gapToNext(step, steps[index + 1]) >= QUIET_GAP_MS)
}

/** `matches` に当たる手の `occurrence` 回目の位置。無ければ -1。 */
function nthIndex(
  steps: readonly FakeSessionStep[],
  occurrence: number,
  matches: (step: FakeSessionStep) => boolean,
): number {
  const positions = steps.flatMap((step, index) => (matches(step) ? [index] : []))
  return positions[occurrence - 1] ?? -1
}

function carriesPending(step: FakeSessionStep, id: string): boolean {
  const pending = asRecord(step.event)["pending"]
  return (
    step.event.kind === "pending-changed" &&
    Array.isArray(pending) &&
    pending.some((ask) => String(asRecord(ask)["id"]) === id)
  )
}

/** 次の手が答えを待つ手（`waitForAnswer`）なら、答えが届くまで来ないので間合いは無限大。 */
function gapToNext(step: FakeSessionStep, next?: FakeSessionStep): number {
  if (next === undefined || next.waitForAnswer) {
    return Infinity
  }
  return next.afterMs - step.afterMs
}
