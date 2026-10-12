import { describe, expect, it } from "vitest"

import { WELCOME_LINE_CHARS } from "../../../../src/server/recommendation/core/welcome-line.ts"
import {
  parseWrittenReactions,
  writtenReactionsQuery,
} from "../../../../src/server/recommendation/core/written-reaction.ts"
import type { ExpressionChoice } from "../../../../src/shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../../src/shared/diagnostic/welcome-writing.ts"

// すべて手で書いた架空の材料と出力。

const EXPRESSIONS = [
  { name: "default", label: "架空のふつう" },
  { name: "excited", label: "架空のわくわく" },
] as const satisfies readonly ExpressionChoice[]

const MATERIAL = { persona: "# 架空の人格\n\n架空の口調で話す。", expressions: EXPRESSIONS }

const OUTPUT = {
  retrying: { text: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { text: "架空の上限", expression: "excited" },
  idle: { text: "架空の待ち", expression: "default" },
}

describe("writtenReactionsQuery", () => {
  it("人格を指示文の前に置き、依頼の文面は表情の選択肢だけ（暦・迎え方・直近の挨拶を渡さない）", () => {
    const query = writtenReactionsQuery(MATERIAL)

    expect(query.systemPrompt.startsWith("# 架空の人格")).toBe(true)
    expect(query.prompt).toBe(
      ["## 表情の選択肢", "- default: 架空のふつう", "- excited: 架空のわくわく"].join("\n"),
    )
  })

  it("出力の形で4つの出来事の行を欠かせず、行の表情を選択肢の名前に限る", () => {
    const line = {
      properties: { text: { type: "string" }, expression: { enum: ["default", "excited"] } },
      required: ["text", "expression"],
    }
    expect(writtenReactionsQuery(MATERIAL).schema).toMatchObject({
      properties: { retrying: line, failed: line, limited: line, idle: line },
      required: ["retrying", "failed", "limited", "idle"],
      additionalProperties: false,
    })
  })
})

describe("parseWrittenReactions", () => {
  it("4行が揃えば、前後の空白を落とした行にする", () => {
    expect(
      parseWrittenReactions(
        { ...OUTPUT, idle: { text: " 架空の待ち ", expression: "default" } },
        EXPRESSIONS,
      ),
    ).toEqual({ kind: "accepted", value: OUTPUT })
  })

  it.each<[string, unknown, WelcomeRejection]>([
    ["オブジェクトでない", "架空", "missing"],
    ["出来事が欠けている", { retrying: OUTPUT.retrying, failed: OUTPUT.failed }, "missing"],
    ["行が空", { ...OUTPUT, failed: { text: " ", expression: "default" } }, "empty"],
    [
      "行が改行入り",
      { ...OUTPUT, failed: { text: "架空の\n失敗", expression: "default" } },
      "newline",
    ],
    [
      "行が上限を超える",
      { ...OUTPUT, limited: { text: "あ".repeat(WELCOME_LINE_CHARS + 1), expression: "default" } },
      "too-long",
    ],
    [
      "行に差し込み口がある",
      { ...OUTPUT, idle: { text: "{札} を待つ", expression: "default" } },
      "mark-count",
    ],
    [
      "行が知らない表情",
      { ...OUTPUT, retrying: { text: "架空", expression: "架空の表情" } },
      "unknown-expression",
    ],
  ])("%s なら落とす", (_, value, reason) => {
    expect(parseWrittenReactions(value, EXPRESSIONS)).toEqual({ kind: "rejected", reason })
  })
})
