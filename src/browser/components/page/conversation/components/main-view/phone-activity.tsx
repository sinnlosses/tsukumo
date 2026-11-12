// 新しい器の狭い幅で、顔と吹き出しの下に出す「手元」か「待ち」の1行。
// 手順を持つターンのあいだだけ出し、字は「いまのフェーズ」の1行と同じものを読む。

import type { ReactElement } from "react"

import { useCurrentStep } from "./hooks/use-current-step.ts"

export function PhoneActivity(): ReactElement {
  const step = useCurrentStep()
  if (step.kind === "none") {
    return <></>
  }
  const { activity } = step
  return (
    <span data-tone={activity.tone}>
      {activity.tone === "asking" ? "待ち" : "手元"}: {activity.text}
    </span>
  )
}
