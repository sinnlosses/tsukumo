import { describe, expect, it } from "vitest"

import { parseCharacterDefinition } from "../../../src/shared/character-pack/character-definition.ts"
import {
  expressionChoices,
  expressionNames,
  resolveExpressionLabel,
} from "../../../src/shared/character-pack/expression-choice.ts"
import { characterDefinition, FULL_DEFINITION_JSON, portraits } from "../../fixture/character.ts"

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
