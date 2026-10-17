import { describe, expect, it } from "vitest"

import { checkMermaidSyntax } from "../../../../src/server/report/adapter/report-mermaid-syntax.ts"

const BROKEN = "sequenceDiagram\n  A->>B: hi; there"
const VALID = "sequenceDiagram\n  A->>B: hi"

describe("checkMermaidSyntax", () => {
  it("割れる図の通し番号と行と字句の名前を返し、通る図は返さない", async () => {
    const faults = await checkMermaidSyntax([VALID, BROKEN])
    expect(faults).toEqual([{ kind: "located", block: 2, line: 2, token: "NEWLINE" }])
  })

  it("構文エラーの行が取れない図は行なしで返す", async () => {
    expect(await checkMermaidSyntax(["notADiagram\n  x"])).toEqual([
      { kind: "unlocated", block: 1 },
    ])
  })

  it("graph が組む stadium（括弧を含むラベル）・subgraph・style の図は通る", async () => {
    const graph = [
      "flowchart LR",
      '  n0(["@a (b) #quot;c#quot;"])',
      '  subgraph g0["群"]',
      '    n1["処理"]',
      '    n2{"分岐"}',
      "  end",
      '  n0 -->|"a|b"| n1',
      "  n1 --> n2",
      "  style g0 fill:#222222,stroke:#555555,stroke-width:1px,stroke-dasharray:5 4",
    ].join("\n")

    expect(await checkMermaidSyntax([graph])).toEqual([])
  })

  it("全部通れば空を返す", async () => {
    expect(await checkMermaidSyntax([VALID])).toEqual([])
  })

  it("本体の大域に window を置かない", async () => {
    await checkMermaidSyntax([VALID])
    expect("window" in globalThis).toBe(false)
  })
})
