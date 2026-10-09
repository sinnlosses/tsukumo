// 狭い画面の「いまの段」のロジック。いまの段の見出しと、いま走っている手順の1行(再試行中・答え待ちを含む)を畳む。

import {
  currentPhaseOf,
  type WorkPhase,
} from "../../../../../../../../../shared/session/work-plan.ts"
import { isTurnCounting } from "../../../../../../../../domain/turn-elapsed.ts"
import { useNowWhile } from "../../../../../../../../hooks/use-now-while.ts"
import { useCurrentTurnSteps } from "../../../../../../../../stores/current-turn-steps.ts"
import { useSession } from "../../../../../../../../stores/session.ts"
import { workActivityOf, type WorkActivity } from "../../../domain/work-activity.ts"

/** 見出しは段取りがあるときだけ「いまの段 · 5 題」。無ければ1行だけ。 */
export type CurrentStepModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly heading: string
      readonly activity: WorkActivity
    }

const HEADING = "いまの段"

export function useCurrentStep(): CurrentStepModel {
  const turnStepList = useCurrentTurnSteps()
  const turn = useSession((session) => session.state.turn)
  const pending = useSession((session) => session.state.pending)
  const reportDrafting = useSession((session) => session.state.reportDrafting)
  const backgroundTasks = useSession((session) => session.state.backgroundTasks)
  const apiTrouble = useSession((session) => session.state.apiTrouble)
  const records = useSession((session) => session.state.records)
  const now = useNowWhile(isTurnCounting(turn, backgroundTasks.length))

  if (turnStepList.kind !== "turn") {
    return { kind: "none" }
  }

  return {
    kind: "shown",
    heading: headingOf(currentPhaseOf(turnStepList.plan)),
    activity: workActivityOf({
      turnStepList,
      firstPending: pending[0],
      reportDrafting,
      backgroundTasks,
      turn,
      apiTrouble,
      records,
      now,
    }),
  }
}

function headingOf(phase: WorkPhase): string {
  return phase.kind === "phase"
    ? `${HEADING} · ${phase.indexes.map((index) => String(index + 1)).join("·")} ${phase.name}`
    : HEADING
}
