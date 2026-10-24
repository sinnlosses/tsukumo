// 疑似セッションの予定（`startupSteps`）から決まる待ちと検査。

import { countBy } from "remeda"

import {
  type FakeSessionStep,
  startupSteps,
} from "../../src/server/session-driver/adapter/fake-session.ts"
import { bundledFakeSession } from "../fixture/bundled-fake-session.ts"
import type { MessageRecord } from "./message-record.ts"

/**
 * fake driver が流し始める予定（`startupSteps`）を読み、最初の静かな区切りまでの手が
 * 種別ごとの回数ですべて届くまで待つ。区切りは予定の時刻だけから決まり、走らせる速さに依らない。
 */
export async function waitForQuietPoint(messages: MessageRecord, scene: string): Promise<void> {
  const session = bundledFakeSession()
  const counts = countBy(
    stepsThroughQuietPoint(startupSteps(session, scene, undefined)),
    (step) => step.event.kind,
  )
  for (const [kind, count] of Object.entries(counts)) {
    await messages.waitForEvent(kind, count)
  }
}

/**
 * `waitForEvent(kind, occurrence)` が待った手から、疑似セッションの予定の次の手までの間合いを検査する。
 * `scene: "none"` は依頼のたびに `turns[]` から動的に選ばれる場面なので、ここでは検査しない
 * （fake driver の `playNextTurn`）。待った手が予定に見当たらないとき（UI の操作で生まれる手を
 * 待った場合など）も検査しない。
 */
export function assertNextStepGap(
  scenario: string,
  scene: string,
  waited: { readonly kind: string; readonly occurrence: number },
): void {
  if (scene === "none") {
    return
  }
  const ordered = startupSteps(bundledFakeSession(), scene, undefined)
  let seen = 0
  for (const [index, step] of ordered.entries()) {
    if (step.event.kind !== waited.kind) {
      continue
    }
    seen += 1
    if (seen !== waited.occurrence) {
      continue
    }
    const next = ordered[index + 1]
    if (next === undefined) {
      return
    }
    const gap = gapToNext(step, next)
    if (gap < MIN_NEXT_STEP_GAP_MS) {
      throw new Error(
        `${scenario}（場面 ${scene}）は ${waited.kind} の${String(waited.occurrence)}回目から次の手（${next.event.kind}）まで ${String(gap)}ms しかない（${String(MIN_NEXT_STEP_GAP_MS)}ms 要る）。場面を分けて、撮り終えるまで次の手が来ない形にする`,
      )
    }
    return
  }
}

/**
 * 疑似セッションの予定で、次の手までこれ以上空いた時点を静かな区切りと見なす。
 * `open` は最初の区切りまでの手を待つので、渡したあとの操作が場面のタイマーと競わない。
 * 場面の中の手の間隔（`fixture/fake-session/` では 100ms 刻み）より長く、場面の区切り以下にする。
 */
const QUIET_GAP_MS = 500

/**
 * `waitForEvent` で待った手から、疑似セッションの予定の次の手までに要る最小の間合い（ミリ秒）。
 * 次の手が撮り終える前に届くと、messages に1件多く載って食い違う。
 */
const MIN_NEXT_STEP_GAP_MS = 3000

/** 時刻の順の予定を、次の手まで `QUIET_GAP_MS` 以上空く最初の手まで切り出す。 */
function stepsThroughQuietPoint(steps: readonly FakeSessionStep[]): readonly FakeSessionStep[] {
  const quietIndex = steps.findIndex(
    (step, index) => gapToNext(step, steps[index + 1]) >= QUIET_GAP_MS,
  )
  return steps.slice(0, quietIndex + 1)
}

/** 次の手が答えを待つ手（`waitForAnswer`）なら、答えが届くまで来ないので間合いは無限大。 */
function gapToNext(step: FakeSessionStep, next: FakeSessionStep | undefined): number {
  if (next === undefined || next.waitForAnswer) {
    return Infinity
  }
  return next.afterMs - step.afterMs
}
