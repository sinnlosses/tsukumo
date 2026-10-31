import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { appearancePromptPart } from "../../../../src/server/system-prompt/core/appearance-prompt.ts"
import { parseCharacterDefinition } from "../../../../src/shared/character-pack/character-definition.ts"

const DIR = "/home/someone/.tsukumo/characters/架空"

function definitionOf(json: object) {
  return definitionFrom(JSON.stringify(json))
}

function definitionFrom(content: string) {
  const definition = parseCharacterDefinition(content)
  if (definition === undefined) throw new Error("定義として読めない")
  return definition
}

describe("appearancePromptPart", () => {
  it("同梱の唐傘のパックから、default.png を含む立ち絵と background.png の絶対パスと Read の案内が入る", () => {
    const dir = join(import.meta.dirname, "../../../../characters/tsukumo")
    const definition = definitionFrom(readFileSync(join(dir, "character.json"), "utf8"))

    const part = appearancePromptPart(dir, definition)

    expect(part).toContain(`${dir}/default.png`)
    expect(part).toContain(`${dir}/background.png`)
    expect(part).toContain("`Read`")
  })

  it("背景の無い定義では背景の行が出ない", () => {
    const part = appearancePromptPart(DIR, definitionOf({ portraits: { default: "default.png" } }))

    expect(part).toContain(`${DIR}/default.png`)
    expect(part).not.toContain("背景:")
  })

  it("立ち絵も背景も無い定義では節ごと落ちる", () => {
    expect(appearancePromptPart(DIR, definitionOf({ name: "空" }))).toBe("")
  })
})
