// 新しい器の舞台で、吹き出しの下に出す「手元」か「待ち」の行。
// 手順を持つターンのあいだだけ出し、字は「いまのフェーズ」の1行と同じものを読む。答え待ちは「待ち」、ほかは「手元」。
// 紙が働いている回の計画を出しているあいだは、紙の「いま」の行と同じ内容になるので出さない。

import type { ReactElement } from "react"

import { workActivityLabelOf } from "./domain/work-activity.ts"
import { useCurrentStep } from "./hooks/use-current-step.ts"
import { useWorkPlanOnPaper } from "./hooks/use-work-plan-paper.ts"

export function StageActivity(): ReactElement {
  const step = useCurrentStep()
  const onPaper = useWorkPlanOnPaper()
  if (step.kind === "none" || onPaper) {
    return <></>
  }
  const { activity } = step
  return (
    <p data-tone={activity.tone} data-mono={activity.mono}>
      <b>{workActivityLabelOf(activity)}</b>
      <span>{activity.text}</span>
    </p>
  )
}
