import { describe, expect, it, vi } from "vitest"

import {
  pickMeasure,
  topDownSource,
  type FigureMeasure,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/mermaid-figure-measure.ts"

describe("pickMeasure", () => {
  it("ちょうど 12px の段は選び、11.99px の段は選ばない", () => {
    expect(pickMeasure(() => 12)).toBe("body")
    expect(pickMeasure((measure) => (measure === "body" ? 11.99 : 12))).toBe("wide")
  })

  it("狭い段で足りれば、広い段は測らない", () => {
    const textPxAt = vi.fn<(measure: FigureMeasure) => number>(() => 14)
    expect(pickMeasure(textPxAt)).toBe("body")
    expect(textPxAt).toHaveBeenCalledTimes(1)
  })

  it("読む面の段でも下回れば undefined", () => {
    expect(pickMeasure(() => 6.5)).toBeUndefined()
  })
})

describe("topDownSource", () => {
  it("flowchart LR と graph LR の先頭行だけを TD にする", () => {
    expect(topDownSource("flowchart LR\n  A --> B")).toBe("flowchart TD\n  A --> B")
    expect(topDownSource("graph LR;\nA-->B")).toBe("graph TD;\nA-->B")
  })

  it("節点のラベルの中の LR は変えない", () => {
    expect(topDownSource('flowchart LR\n  A["LR の話"] --> B\n  C["flowchart LR"]')).toBe(
      'flowchart TD\n  A["LR の話"] --> B\n  C["flowchart LR"]',
    )
  })

  it("LR 以外の向きと flowchart 以外の図は undefined", () => {
    expect(topDownSource("flowchart TD\n  A --> B")).toBeUndefined()
    expect(topDownSource("flowchart RL\n  A --> B")).toBeUndefined()
    expect(topDownSource("sequenceDiagram\n  A->>B: LR")).toBeUndefined()
    expect(topDownSource("stateDiagram-v2\n  [*] --> A")).toBeUndefined()
  })
})
