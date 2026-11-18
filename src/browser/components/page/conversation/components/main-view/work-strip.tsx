// 進み具合のプログレスバーの入口。

import type { ReactElement } from "react"

import { useWorkStripNow } from "./hooks/use-work-strip-now.ts"
import { useWorkStripSegmentList } from "./hooks/use-work-strip-segment-list.ts"
import { useWorkStrip } from "./hooks/use-work-strip.ts"
import { PresentationalWorkStrip } from "./presentational-work-strip.tsx"

export function WorkStrip(): ReactElement {
  return (
    <PresentationalWorkStrip
      strip={useWorkStrip()}
      now={useWorkStripNow()}
      track={useWorkStripSegmentList()}
    />
  )
}
