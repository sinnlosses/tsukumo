import { describe, expect, it } from "vitest"

import { parseCharacterDefinition } from "../../../src/shared/character-pack/character-definition.ts"
import {
  DEFAULT_CHARACTER_STAGE,
  toCharacterStage,
} from "../../../src/shared/character-pack/character-stage.ts"
import { toCharacterInfo } from "../../../src/shared/character-pack/character.ts"
import { characterPackName } from "../../fixture/character.ts"

describe("toCharacterStage", () => {
  it("欄が揃っていればそのまま読む", () => {
    expect(toCharacterStage({ left: 0, width: 1, fade: ["bottom"], head: 0.2 })).toEqual({
      left: 0,
      width: 1,
      fade: ["bottom"],
      head: 0.2,
    })
  })

  it("オブジェクトでなければ全体が既定になる", () => {
    expect(toCharacterStage(undefined)).toEqual(DEFAULT_CHARACTER_STAGE)
    expect(toCharacterStage([1, 2])).toEqual(DEFAULT_CHARACTER_STAGE)
    expect(toCharacterStage("left")).toEqual(DEFAULT_CHARACTER_STAGE)
  })

  it("読めない欄はその欄だけが既定になり、範囲外の数は帯の端へ寄る", () => {
    expect(toCharacterStage({ left: "x", width: 9, head: -1 })).toEqual({
      left: DEFAULT_CHARACTER_STAGE.left,
      width: 2,
      fade: DEFAULT_CHARACTER_STAGE.fade,
      head: 0,
    })
  })

  it("ぼかす縁は知らない向きと重なりを捨てて決まった順に並べ、空の配列はぼかさない", () => {
    expect(toCharacterStage({ fade: ["left", "middle", "top", "left"] }).fade).toEqual([
      "top",
      "left",
    ])
    expect(toCharacterStage({ fade: [] }).fade).toEqual([])
  })
})

describe("定義と姿の stage", () => {
  it("定義に stage が無いパックも、画面に渡る姿は既定の置き方で立つ", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ name: "架空の精霊" }))
    if (definition === undefined) {
      throw new Error("定義が読めなかった")
    }

    const info = toCharacterInfo({
      definition,
      pack: characterPackName("fictional"),
      editable: true,
    })

    expect(info.stage).toEqual(DEFAULT_CHARACTER_STAGE)
  })

  it("定義の stage を読んで姿へ渡す", () => {
    const definition = parseCharacterDefinition(JSON.stringify({ stage: { head: 0.15 } }))
    if (definition === undefined) {
      throw new Error("定義が読めなかった")
    }

    const info = toCharacterInfo({
      definition,
      pack: characterPackName("fictional"),
      editable: true,
    })

    expect(info.stage.head).toBe(0.15)
  })
})
