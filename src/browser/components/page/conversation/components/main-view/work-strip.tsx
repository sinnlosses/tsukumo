// 進み具合の帯の入口。

import type { ReactElement } from "react"

import { useWorkStrip } from "./hooks/use-work-strip.ts"
import { PresentationalWorkStrip } from "./presentational-work-strip.tsx"

export function WorkStrip(): ReactElement {
  return <PresentationalWorkStrip strip={useWorkStrip()} />
}
