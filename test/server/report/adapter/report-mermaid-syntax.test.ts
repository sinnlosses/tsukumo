import { EventEmitter } from "node:events"

import { afterEach, describe, expect, it, vi } from "vitest"

import { faultOfParseError } from "../../../../src/server/report/adapter/report-mermaid-error.ts"
import { checkMermaidSyntax } from "../../../../src/server/report/adapter/report-mermaid-syntax.ts"

const BROKEN = "sequenceDiagram\n  A->>B: hi; there"
const VALID = "sequenceDiagram\n  A->>B: hi"

describe("checkMermaidSyntax", () => {
  it("割れる図の通し番号と行と字句の名前を返し、通る図は返さない", async () => {
    const faults = await checkMermaidSyntax([VALID, BROKEN])
    expect(faults).toEqual([{ kind: "located", block: 2, line: 2, token: "NEWLINE" }])
  })

  it("class 図・state 図・閉じ忘れの flowchart の割れも、mermaid のエラー文と同じ行を返す", async () => {
    const faults = await checkMermaidSyntax([
      "classDiagram\n  class A {\n  }}",
      "stateDiagram-v2\n  [*] --> A\n  A --> --> B",
      "flowchart LR\n  A[x\n  B --> C",
    ])
    expect(faults.map((fault) => (fault.kind === "located" ? fault.line : 0))).toEqual([3, 3, 4])
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

describe("faultOfParseError", () => {
  it("エラーの hash の行と字句を取り、エラー文は見ない", () => {
    const error = Object.assign(new Error("文言が変わった"), {
      hash: { line: 6, loc: { last_line: 7 }, token: "TAGEND" },
    })
    expect(faultOfParseError(3, error)).toEqual({
      kind: "located",
      block: 3,
      line: 7,
      token: "TAGEND",
    })
  })

  it("hash が無いときだけエラー文の正規表現に戻る", () => {
    const error = new Error("Parse error on line 4:\n...\nExpecting 'A', got 'NEWLINE'")
    expect(faultOfParseError(1, error)).toEqual({
      kind: "located",
      block: 1,
      line: 4,
      token: "NEWLINE",
    })
  })
})

describe("読み込みに時間がかかるとき", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock("node:worker_threads")
    vi.resetModules()
  })

  it("検査の待ちは読み込みが済んでから数え、読み込みが検査の上限より長くても欠陥を返す", async () => {
    const fault = { kind: "located", block: 1, line: 2, token: "NEWLINE" }
    class SlowWorker extends EventEmitter {
      constructor() {
        super()
        setTimeout(() => this.emit("message", { ready: true }), 8000)
      }
      postMessage(request: { id: number }): void {
        setTimeout(() => this.emit("message", { id: request.id, ok: true, faults: [fault] }), 100)
      }
      unref(): void {}
      terminate(): Promise<number> {
        return Promise.resolve(0)
      }
    }
    vi.useFakeTimers()
    vi.resetModules()
    vi.doMock("node:worker_threads", () => ({ Worker: SlowWorker }))
    const { checkMermaidSyntax: check } =
      await import("../../../../src/server/report/adapter/report-mermaid-syntax.ts")

    const pending = check(["x"])
    await vi.advanceTimersByTimeAsync(8200)

    expect(await pending).toEqual([fault])
  })
})
