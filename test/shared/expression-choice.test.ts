import { describe, expect, it } from "bun:test"

import { parseCharacterDefinition } from "../../src/shared/character-definition.ts"
import {
  expressionChoices,
  expressionNames,
  resolveExpressionLabel,
} from "../../src/shared/expression-choice.ts"
import { characterDefinition, portraits } from "../fixture/character.ts"

// characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const FULL_DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  accent: "#f2b0a0",
  expressions: {
    default: "通常",
    thinking: "作業中",
    proud: "どや顔",
    flustered: "あわあわ",
  },
  portraits: {
    default: "default.svg",
    thinking: "thinking.svg",
    proud: "proud.svg",
    flustered: "flustered.svg",
  },
  outfitAccents: {
    default: "#b8c7ff",
    light: "#a8e6c0",
    normal: "#b8c7ff",
    heavy: "#ffb3a7",
  },
})

describe("expressionChoices", () => {
  it("定義の expressions をラベルにする", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition).toBeDefined()
    expect(expressionChoices(definition)).toEqual([
      { name: "default", label: "通常" },
      { name: "thinking", label: "作業中" },
      { name: "proud", label: "どや顔" },
      { name: "flustered", label: "あわあわ" },
    ])
  })

  it("ラベルが無い表情は、表情名がそのままラベルになる", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg", thinking: "thinking.svg" } }),
    )

    expect(expressionChoices(definition)).toEqual([
      { name: "default", label: "default" },
      { name: "thinking", label: "thinking" },
    ])
  })

  it("立ち絵が一部しか無い定義では、その表情と default だけを返す", () => {
    // ラベルは1つも無く、立ち絵は thinking だけ（default の立ち絵も無い）。
    const definition = characterDefinition({ portraits: portraits({ thinking: "thinking.svg" }) })

    expect(expressionNames(expressionChoices(definition))).toEqual(["default", "thinking"])
  })

  it("立ち絵が無くてもラベルがあれば選べる（絵は default に落ちる）", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg" }, expressions: { proud: "どや顔" } }),
    )

    expect(expressionNames(expressionChoices(definition))).toEqual(["default", "proud"])
  })

  it("定義が無いときは default だけを返す（受け付ける表情名が空にならない）", () => {
    expect(expressionChoices(undefined)).toEqual([{ name: "default", label: "default" }])
  })

  // 表情を足しても（EXPRESSIONS 側に serious / curious が増えても）、そのパックの定義に
  // 立ち絵もラベルも無ければ選択肢に出ない（docs/requirements.md 4.3。default だけは必ず残る）。
  it("新しく足した表情（serious / curious）も、立ち絵とラベルのどちらも無ければ選択肢に出ない", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.png" } }),
    )

    expect(expressionNames(expressionChoices(definition))).toEqual(["default"])
  })
})

describe("resolveExpressionLabel", () => {
  it("一覧にある表情はそのラベルを返す", () => {
    const choices = expressionChoices(parseCharacterDefinition(FULL_DEFINITION_JSON))

    expect(resolveExpressionLabel(choices, "proud")).toBe("どや顔")
  })

  it("一覧に無い表情は表情名をそのまま返す", () => {
    expect(resolveExpressionLabel([], "thinking")).toBe("thinking")
  })
})
