// 依頼の手順（`currentTurnSteps` の導出）を、記録1つにつき1回だけ畳む場所。
// 「いまの作業」の札が2箇所に描かれても、同じ記録からは1回しか計算しない。
//
// `useSession` のセレクタは同じ姿なら同じものを返す必要があるので、記録の並びそのものをキーにして結果を覚える（`WeakMap` なので、古い記録と一緒に落ちる）。

import type { SessionRecord } from "../../shared/session/session-state.ts"
import { currentTurnSteps, type TurnStepList } from "../../shared/session/turn-step.ts"
import { useSession } from "./session.ts"

const STEPS_BY_RECORDS = {
  live: new WeakMap<readonly SessionRecord[], TurnStepList>(),
  ended: new WeakMap<readonly SessionRecord[], TurnStepList>(),
}

/** いちばん新しい依頼の手順。 */
export function useCurrentTurnSteps(): TurnStepList {
  return useSession((session) =>
    currentTurnStepsOf(session.state.records, session.state.endedReason !== undefined),
  )
}

/** 記録の並び1つから畳んだ手順。2回目からは覚えたものを返すので、セレクタの中から呼んでよい。 */
export function currentTurnStepsOf(
  records: readonly SessionRecord[],
  sessionEnded: boolean,
): TurnStepList {
  const remembered = sessionEnded ? STEPS_BY_RECORDS.ended : STEPS_BY_RECORDS.live
  const found = remembered.get(records)
  if (found !== undefined) {
    return found
  }
  const steps = currentTurnSteps(records, sessionEnded)
  remembered.set(records, steps)
  return steps
}
