import { describe, expect, test } from "vitest"

import {
  extractHtml,
  judgeReport,
  parseTopics,
  sessionIndexFor,
} from "../../../../scripts/dev/lib/html-comparison-write.ts"

const report = {
  id: "root",
  component: "Report",
  conclusion: ["架空の結論。"],
  sessionRemaining: "",
  closing: { text: "架空の締め。", expression: "default" },
  children: ["s1"],
}
const section = { id: "s1", component: "Section", heading: "架空の節", children: ["p1"] }
const paragraph = { id: "p1", component: "Paragraph", text: "架空の地の文" }

describe("judgeReport", () => {
  test("形・構造・省けない欄・記法の条を満たす一覧は通る", () => {
    const judged = judgeReport(JSON.stringify([report, section, paragraph]), new Set())

    expect(judged.kind).toBe("accepted")
  })

  test("JSON の配列でない出力は引数の検査で落ち、段を使い切っていても落ちる", () => {
    const judged = judgeReport("配列ではない", new Set(["structure", "violation"]))

    expect(judged).toMatchObject({ kind: "rejected", stage: "schema" })
  })

  test("参照されない部品は構造で1回だけ差し戻し、使い切ったあとは通す", () => {
    const orphan = { id: "p2", component: "Paragraph", text: "架空の離れた文" }
    const text = JSON.stringify([report, section, paragraph, orphan])

    expect(judgeReport(text, new Set())).toMatchObject({ kind: "rejected", stage: "structure" })
    expect(judgeReport(text, new Set(["structure"])).kind).toBe("accepted")
  })

  test("締めのセリフを欠いた一覧は省けない欄で差し戻す", () => {
    const { closing: _closing, ...withoutClosing } = report

    expect(
      judgeReport(JSON.stringify([withoutClosing, section, paragraph]), new Set()),
    ).toMatchObject({ kind: "rejected", stage: "violation", codes: ["missing-closing"] })
  })
})

describe("parseTopics", () => {
  test("id が重なる題材は投げる", () => {
    const topic = { id: "a", request: "架空の依頼", facts: "架空の材料" }

    expect(() => parseTopics([topic, topic])).toThrow("重なっている")
  })
})

test("extractHtml はコードフェンスと前後の説明を落とす", () => {
  expect(extractHtml("前置き\n```html\n<!doctype html><html><body>x</body></html>\n```")).toBe(
    "<!doctype html><html><body>x</body></html>",
  )
})

test("sessionIndexFor は場面の並びだけを差し替え、ほかの欄を残す", () => {
  expect(sessionIndexFor({ opening: [1], turns: ["old"] }, ["a", "b"])).toEqual({
    opening: [1],
    turns: ["a", "b"],
  })
})
