import { describe, expect, it } from "vitest"
import type { z } from "zod"

import { parseReportBody } from "../../../../../src/server/report/core/body/body-fence.ts"
import { tableBlockSchema } from "../../../../../src/shared/report/report-block-comparison.ts"
import {
  graphBlockSchema,
  imageBlockSchema,
  mermaidBlockSchema,
} from "../../../../../src/shared/report/report-block-diagram.ts"
import {
  claimsBlockSchema,
  codeBlockSchema,
  noteBlockSchema,
} from "../../../../../src/shared/report/report-block-prose.ts"

const FENCE = "```"

function fence(head: string, ...lines: readonly string[]): string {
  return [`${FENCE}${head}`, ...lines, FENCE].join("\n")
}

const ALL_KINDS_BODY = [
  "前の文",
  fence(
    "figure",
    "question: どの段が長いか",
    "relation: compare",
    "unit: 分",
    "data:",
    "  計画: 4",
    "  実装: 31",
  ),
  "二つ目の文",
  fence("graph", "A -> B: 渡す"),
  fence("mermaid", "sequenceDiagram", "  A->>B: 呼ぶ"),
  fence("table 件数の表", "| 名 | 数 |", "| --- | --- |", "| a | 1 |"),
  fence("code ts src/a.ts", "const a = 1"),
  fence("callout warn", "戻せない操作"),
  fence("claims", "unverified | 架空の主張 | 根拠 | 確かめ方"),
  fence("image 架空の画面", "架空.png", "左上"),
  "最後の文",
].join("\n")

describe("parseReportBody", () => {
  it("8 種のフェンスと散文を、本文の順のまま塊に全部残す", () => {
    const { blocks, brokenFenceCount } = parseReportBody(ALL_KINDS_BODY)

    expect(brokenFenceCount).toBe(0)
    expect(blocks.map((block) => block.kind)).toEqual([
      "markdown",
      "plot",
      "markdown",
      "graph",
      "mermaid",
      "table",
      "code",
      "note",
      "claims",
      "image",
      "markdown",
    ])
  })

  it("フェンスを 1 つ読み落とす実装なら、並びの検査が落ちる（欠けた種類を数えて確かめる）", () => {
    const kinds = parseReportBody(ALL_KINDS_BODY).blocks.map((block) => block.kind)

    expect(kinds.filter((kind) => kind !== "markdown")).toHaveLength(8)
  })

  it("壊れた型つきフェンスは素のコードブロックに落とし、差し戻さず数える", () => {
    const body = [
      fence("figure", "question: 題", "relation: 架空の関係", "data:", "  a: 1"),
      fence("graph", "A -> B", "->だけの行 ->"),
      fence("mermaid", ""),
      fence("table", "| a | b |", "| --- | --- |", "| 1 |"),
      fence("code", "x"),
      fence("callout 架空の種別", "文"),
      fence("claims", "unverified | 主張"),
      fence("image"),
    ].join("\n")

    const { blocks, brokenFenceCount } = parseReportBody(body)

    expect(brokenFenceCount).toBe(8)
    expect(blocks.every((block) => block.kind === "code")).toBe(true)
  })

  it("塊の schema の中身の制約に外れるフェンスも素のコードブロックに落とす", () => {
    const body = [
      fence("claims", "架空の確度 | 主張 | 根拠 | 確かめ方"),
      fence("claims", ""),
      fence("table", "| a |", "| --- |", "| 1 |"),
      fence("table", "| a | b |", "| --- | --- |"),
      fence("graph", ""),
    ].join("\n")

    const { blocks, brokenFenceCount } = parseReportBody(body)

    expect(brokenFenceCount).toBe(5)
    expect(blocks.every((block) => block.kind === "code")).toBe(true)
  })

  it("確定の主張は確かめ方が無くても読む", () => {
    const { blocks, brokenFenceCount } = parseReportBody(fence("claims", "confirmed | 主張"))

    expect(brokenFenceCount).toBe(0)
    expect(blocks).toEqual([
      {
        kind: "claims",
        items: [{ claim: "主張", certainty: "confirmed", basis: "", howToVerify: "" }],
        fold: "",
        aside: "",
      },
    ])
  })

  it("読めたフェンスの塊は、塊の schema に通した値と同じ（省いた欄の既定値を含む）", () => {
    const schemas: readonly (readonly [string, z.ZodType])[] = [
      ["graph", graphBlockSchema],
      ["mermaid", mermaidBlockSchema],
      ["table", tableBlockSchema],
      ["code", codeBlockSchema],
      ["note", noteBlockSchema],
      ["claims", claimsBlockSchema],
      ["image", imageBlockSchema],
    ]
    const body = [
      ALL_KINDS_BODY,
      fence("code ts"),
      fence("claims", "confirmed | 主張 | 根拠"),
    ].join("\n")
    const { blocks } = parseReportBody(body)

    const checked = schemas.flatMap(([kind, schema]) =>
      blocks
        .filter((block) => block.kind === kind)
        .map((block) => ({ block, parsed: schema.parse(block) })),
    )

    expect(checked.map(({ block }) => block.kind)).toEqual([
      "graph",
      "mermaid",
      "table",
      "code",
      "code",
      "note",
      "claims",
      "claims",
      "image",
    ])
    for (const { block, parsed } of checked) {
      expect(block).toEqual(parsed)
    }
  })

  it("型の無いフェンスは散文のまま残し、数えない", () => {
    const body = ["文", fence("ts", "const a = 1"), "後"].join("\n")

    const { blocks, brokenFenceCount } = parseReportBody(body)

    expect(brokenFenceCount).toBe(0)
    expect(blocks).toEqual([{ kind: "markdown", markdown: body, fold: "", aside: "" }])
  })

  it("閉じの無い型つきフェンスは末尾まで読む", () => {
    const { blocks, brokenFenceCount } = parseReportBody("```graph\nA -> B: 渡す")

    expect(brokenFenceCount).toBe(0)
    expect(blocks.map((block) => block.kind)).toEqual(["graph"])
  })

  it("空の本文は塊を作らない", () => {
    expect(parseReportBody("")).toEqual({ blocks: [], brokenFenceCount: 0 })
    expect(parseReportBody("\n  \n")).toEqual({ blocks: [], brokenFenceCount: 0 })
  })

  it("フェンスの無い本文は逃げ道の部品1つと同じ結果になる", () => {
    const body = "\n\n## 見出し\n本文  \n"

    expect(parseReportBody(body).blocks).toEqual([
      { kind: "markdown", markdown: "## 見出し\n本文", fold: "", aside: "" },
    ])
  })
})
