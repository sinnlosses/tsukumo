import { describe, expect, it } from "vitest"

import {
  parseWrittenReactions,
  writtenReactionsQuery,
} from "../../../../src/server/welcome-greeting/core/written-reaction.ts"
import type { ExpressionChoice } from "../../../../src/shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../../src/shared/diagnostic/welcome-writing.ts"

// すべて手で書いた架空の材料と出力。

const EXPRESSIONS = [
  { name: "default", label: "架空のふつう" },
  { name: "excited", label: "架空のわくわく" },
] as const satisfies readonly ExpressionChoice[]

const MATERIAL = { persona: "# 架空の人格\n\n架空の口調で話す。", expressions: EXPRESSIONS }

const OUTPUT = {
  retrying: { withMark: "架空の{回数}回目", withoutMark: "架空の再試行", expression: "default" },
  failed: { text: "架空の失敗", expression: "default" },
  limited: { withMark: "架空の{時刻}まで", withoutMark: "架空の上限", expression: "excited" },
  idle: { withMark: "架空の{札}から", withoutMark: "架空の待ち", expression: "default" },
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
    const expression = { enum: ["default", "excited"] }
    const plain = {
      properties: { text: { type: "string" }, expression },
      required: ["text", "expression"],
    }
    const marked = {
      properties: { withMark: { type: "string" }, withoutMark: { type: "string" }, expression },
      required: ["withMark", "withoutMark", "expression"],
    }
    expect(writtenReactionsQuery(MATERIAL).schema).toMatchObject({
      properties: { retrying: marked, failed: plain, limited: marked, idle: marked },
      required: ["retrying", "failed", "limited", "idle"],
      additionalProperties: false,
    })
  })
})

describe("parseWrittenReactions", () => {
  it("4行が揃えば、前後の空白を落とした行にする", () => {
    expect(
      parseWrittenReactions(
        { ...OUTPUT, failed: { text: " 架空の失敗 ", expression: "default" } },
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
      { ...OUTPUT, failed: { text: "あ".repeat(61), expression: "default" } },
      "too-long",
    ],
    [
      "印の無い文が印を持つ",
      { ...OUTPUT, idle: { ...OUTPUT.idle, withoutMark: "{札} を待つ" } },
      "mark-count",
    ],
    [
      "印を持つ文が印を持たない",
      { ...OUTPUT, retrying: { ...OUTPUT.retrying, withMark: "印なし" } },
      "mark-count",
    ],
    [
      "印を持つ文が印を2つ持つ",
      { ...OUTPUT, limited: { ...OUTPUT.limited, withMark: "{時刻}と{時刻}" } },
      "mark-count",
    ],
    [
      "失敗の文が自分の印でなく札の印を持つ",
      { ...OUTPUT, failed: { text: "{札}", expression: "default" } },
      "mark-count",
    ],
    [
      "印を持つ文が別の出来事の印を持つ",
      { ...OUTPUT, limited: { ...OUTPUT.limited, withMark: "{回数}まで" } },
      "mark-count",
    ],
    [
      "行が知らない表情",
      { ...OUTPUT, retrying: { ...OUTPUT.retrying, expression: "架空の表情" } },
      "unknown-expression",
    ],
  ])("%s なら落とす", (_, value, reason) => {
    expect(parseWrittenReactions(value, EXPRESSIONS)).toEqual({ kind: "rejected", reason })
  })
})
