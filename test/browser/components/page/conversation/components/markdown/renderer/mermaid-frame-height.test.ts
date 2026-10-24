import { describe, expect, it } from "vitest"

import { mermaidFrameHeight } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/mermaid-frame-height.ts"

describe("mermaidFrameHeight", () => {
  it("縦の flowchart は、いちばん長い道の段数から高さを寄せる", () => {
    expect(mermaidFrameHeight("flowchart TD\n  A --> B\n  B --> C")).toBe(268)
    expect(mermaidFrameHeight("flowchart TD\n  A --> B --> C --> D")).toBe(366)
    expect(
      mermaidFrameHeight("flowchart TD\n  R --> A\n  R --> B\n  R --> C\n  style R fill:#000"),
    ).toBe(170)
  })

  it("輪のある flowchart でも止まる", () => {
    expect(mermaidFrameHeight("flowchart TD\n  A --> B\n  B --> A")).toBe(170)
  })

  it("sequenceDiagram はメッセージの数から寄せる", () => {
    expect(mermaidFrameHeight("sequenceDiagram\n  A->>B: x\n  B-->>A: y")).toBe(320)
  })

  it("横の flowchart や読めない図は行数の目安に落とす", () => {
    expect(mermaidFrameHeight("flowchart LR\n  A --> B")).toBe(66)
    expect(mermaidFrameHeight('pie\n  "a": 1')).toBe(66)
  })
})
