// 狭い画面の「いまの段」の入口。

import type { ReactElement } from "react"

import { useCurrentStep } from "./hooks/use-current-step.ts"
import { PresentationalCurrentStep } from "./presentational-current-step.tsx"

export function CurrentStep(): ReactElement | null {
  return <PresentationalCurrentStep step={useCurrentStep()} />
}
