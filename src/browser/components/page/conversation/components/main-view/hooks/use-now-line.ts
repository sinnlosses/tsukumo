// 流れの末尾の「いまの行」のロジック。狭い画面の「いまの段」と同じ文（`workActivityOf`）を読む。

import { reportDraftingOf } from "../../../../../../../shared/session/turn-progress.ts"
import { isTurnCounting } from "../../../../../../domain/turn-elapsed.ts"
import { useNowWhile } from "../../../../../../stores/clock.ts"
import { useCurrentTurnSteps } from "../../../../../../stores/current-turn-step-list.ts"
import { useSession } from "../../../../../../stores/session.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { nowLineOf, type NowLine } from "../domain/now-line.ts"
import { workActivityOf } from "../domain/work-activity.ts"

export function useNowLine(viewingPast: boolean): NowLine {
  const turnStepList = useCurrentTurnSteps()
  const contentKind = useMainViewContent((state) => state.content.kind)
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const reportDrafting = useSession((session) => reportDraftingOf(session.state.sdkTurn))
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const workflowSteps = useSession((session) => session.state.workflowSteps)
  const workflowProgress = useSession((session) => session.state.workflowProgress)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const records = useSession((session) => session.state.records)
  const now = useNowWhile(isTurnCounting(turn, backgroundTasks.length))

  if (turnStepList.kind !== "turn") {
    return { kind: "none" }
  }
  return nowLineOf({
    contentKind,
    turnStepListKind: turnStepList.kind,
    viewingPast,
    activity: workActivityOf({
      turnStepList,
      firstPending: pending[0],
      reportDrafting,
      backgroundTasks,
      workflowSteps,
      workflowProgress,
      turn,
      apiTrouble,
      records,
      now,
    }),
  })
}
