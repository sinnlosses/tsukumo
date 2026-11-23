import { describe, expect, it } from "vitest"

import { parseCharacterDefinition } from "../../../src/shared/character-pack/character-definition.ts"
import {
  expressionChoices,
  expressionEnumForSpeak,
  expressionGuideForSpeak,
  expressionLabelNote,
  expressionNames,
} from "../../../src/shared/character-pack/expression-choice.ts"
import { characterDefinition, FULL_DEFINITION_JSON, portraits } from "../../fixture/character.ts"

describe("expressionChoices", () => {
  it("定義の expressions をラベルにする", () => {
    const definition = parseCharacterDefinition(FULL_DEFINITION_JSON)

    expect(definition).toBeDefined()
    expect(expressionChoices(definition)).toEqual([
      { name: "default", role: "通常", label: "通常" },
      { name: "thinking", role: "考え中", label: "作業中" },
      { name: "proud", role: "得意気", label: "どや顔" },
      { name: "flustered", role: "慌て", label: "あわあわ" },
    ])
  })

  it("ラベルが無い表情は、役割の名だけを持つ", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg", thinking: "thinking.svg" } }),
    )

    expect(expressionChoices(definition)).toEqual([
      { name: "default", role: "通常" },
      { name: "thinking", role: "考え中" },
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
    expect(expressionChoices(undefined)).toEqual([{ name: "default", role: "通常" }])
  })
})

describe("expressionLabelNote", () => {
  it("ラベルがあれば返し、無い・一覧に無い表情は空", () => {
    const choices = expressionChoices(parseCharacterDefinition(FULL_DEFINITION_JSON))

    expect(expressionLabelNote(choices, "proud")).toEqual({ labelNote: "どや顔" })
    expect(expressionLabelNote([], "thinking")).toEqual({})
  })
})

describe("expressionEnumForSpeak", () => {
  it("default を先頭に置き、重複なく選べる全ての表情を含む", () => {
    const choices = expressionChoices(parseCharacterDefinition(FULL_DEFINITION_JSON))

    const result = expressionEnumForSpeak(choices)
    expect(result[0]).toBe("default")
    expect(new Set(result).size).toBe(result.length)
    expect(new Set(result)).toEqual(new Set(expressionNames(choices)))
  })

  it("定義が無いときは default だけ", () => {
    const choices = expressionChoices(undefined)

    expect(expressionEnumForSpeak(choices)).toEqual(["default"])
  })
})

describe("expressionGuideForSpeak", () => {
  it("各表情を名前（ラベル）の形で組む", () => {
    const choices = expressionChoices(parseCharacterDefinition(FULL_DEFINITION_JSON))

    const result = expressionGuideForSpeak(choices)
    expect(result).toBe(
      [
        "表情。default: 通常。特に感情を乗せない、ふだんの話し方のとき",
        "thinking: 考え中（作業中）。調べている・迷っている・考えをまとめているとき",
        "proud: 得意気（どや顔）。うまくいった・やり遂げた・自信があるとき",
        "flustered: 慌て（あわあわ）。失敗した・想定外で焦った・照れて取り乱したとき",
      ].join(" / "),
    )
  })

  it("ラベルが無い場合も役割の名が出る", () => {
    const definition = parseCharacterDefinition(
      JSON.stringify({ portraits: { default: "default.svg", thinking: "thinking.svg" } }),
    )

    expect(expressionGuideForSpeak(expressionChoices(definition))).toBe(
      "表情。default: 通常。特に感情を乗せない、ふだんの話し方のとき / thinking: 考え中。調べている・迷っている・考えをまとめているとき",
    )
  })
})
