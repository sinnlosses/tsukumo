import { describe, expect, it } from "vitest"

import {
  parseWrittenAizuchi,
  writtenAizuchiQuery,
} from "../../../../src/server/welcome-greeting/core/written-aizuchi.ts"
import type { ExpressionChoice } from "../../../../src/shared/character-pack/expression-choice.ts"
import type { WelcomeRejection } from "../../../../src/shared/diagnostic/welcome-writing.ts"

// すべて手で書いた架空の材料と出力。

const EXPRESSIONS = [
  { name: "default", label: "架空のふつう" },
  { name: "excited", label: "架空のわくわく" },
] as const satisfies readonly ExpressionChoice[]

const MATERIAL = { persona: "# 架空の人格\n\n架空の口調で話す。", expressions: EXPRESSIONS }

const PAIR = { chip: "架空の札", reply: "架空の返事", expression: "excited" }
const THREE = [PAIR, PAIR, PAIR]
const OUTPUT = { deliver: THREE, stumble: THREE, work: THREE }

describe("writtenAizuchiQuery", () => {
  it("人格を指示文の前に置き、依頼の文面は表情の選択肢だけ", () => {
    const query = writtenAizuchiQuery(MATERIAL)

    expect(query.kind).toBe("aizuchi")
    expect(query.systemPrompt.startsWith("# 架空の人格")).toBe(true)
    expect(query.prompt).toBe(
      ["## 表情の選択肢", "- default: 架空のふつう", "- excited: 架空のわくわく"].join("\n"),
    )
  })

  it("出力の形で3局面を欠かせず、局面ごとに3組、表情を選択肢の名前に限る", () => {
    const schema = writtenAizuchiQuery(MATERIAL).schema

    expect(schema).toMatchObject({
      required: ["deliver", "stumble", "work"],
      additionalProperties: false,
      properties: {
        deliver: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: { properties: { expression: { enum: ["default", "excited"] } } },
        },
      },
    })
  })
})

describe("parseWrittenAizuchi", () => {
  it("3局面が3組ずつ揃えば、前後の空白を落とした組にする", () => {
    expect(
      parseWrittenAizuchi(
        { ...OUTPUT, work: [{ ...PAIR, chip: " 架空の札 " }, PAIR, PAIR] },
        EXPRESSIONS,
      ),
    ).toEqual({ kind: "accepted", value: OUTPUT })
  })

  it.each<[string, unknown, WelcomeRejection]>([
    ["オブジェクトでない", "架空", "missing"],
    ["局面が欠けている", { deliver: THREE, stumble: THREE }, "missing"],
    ["組が2つしかない", { ...OUTPUT, work: [PAIR, PAIR] }, "missing"],
    ["札が空", { ...OUTPUT, work: [{ ...PAIR, chip: " " }, PAIR, PAIR] }, "empty"],
    [
      "返事が改行入り",
      { ...OUTPUT, work: [{ ...PAIR, reply: "架空の\n返事" }, PAIR, PAIR] },
      "newline",
    ],
    [
      "返事が上限を超える",
      { ...OUTPUT, stumble: [PAIR, { ...PAIR, reply: "あ".repeat(61) }, PAIR] },
      "too-long",
    ],
    [
      "知らない表情",
      { ...OUTPUT, deliver: [PAIR, PAIR, { ...PAIR, expression: "架空の表情" }] },
      "unknown-expression",
    ],
    [
      "表情が欠けている",
      { ...OUTPUT, deliver: [PAIR, PAIR, { chip: "架空", reply: "架空" }] },
      "missing",
    ],
  ])("%s なら全部を落とす", (_, value, reason) => {
    expect(parseWrittenAizuchi(value, EXPRESSIONS)).toEqual({ kind: "rejected", reason })
  })
})
