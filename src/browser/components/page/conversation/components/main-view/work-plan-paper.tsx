// 紙のワークプランと、入力欄に置く段の狐火の並びの入口。

import type { ReactElement } from "react"

import { useStoppedChoiceKeys, useWorkPlanPaper } from "./hooks/use-work-plan-paper.ts"
import { PresentationalWorkPlanPaper, WorkPlanLamps } from "./presentational-work-plan-paper.tsx"

export function WorkPlanPaper(): ReactElement {
  const model = useWorkPlanPaper()
  useStoppedChoiceKeys(model)
  return <>{model.kind !== "none" && <PresentationalWorkPlanPaper model={model} />}</>
}

/** 入力欄の札の狐火。働くあいだ、ワークプランがあるときだけ出す。 */
export function WorkPlanDockLamps(): ReactElement {
  const model = useWorkPlanPaper()
  return (
    <>
      {model.kind === "working" && model.rows.length > 0 && (
        <WorkPlanLamps rows={model.rows} label={model.position} />
      )}
    </>
  )
}
