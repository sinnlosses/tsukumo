import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  readCharacterAssets,
  readCharacterDefinition,
} from "../../src/infrastructure/character-asset.ts"

// フィクスチャは characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  portraits: {
    default: "default.svg",
    working: "working.svg",
  },
  outfitAccents: {
    default: "#b8c7ff",
    normal: "#b8c7ff",
  },
})

const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-character-asset-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("readCharacterDefinition", () => {
  it("character.json を読んでパースする", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const definition = readCharacterDefinition(dir)

    expect(definition?.name).toBe("架空の精霊")
  })

  it("character.json が無ければ undefined", () => {
    expect(readCharacterDefinition(dir)).toBeUndefined()
  })

  it("character.json が壊れていれば undefined", () => {
    writeFileSync(join(dir, "character.json"), "{壊れた json")

    expect(readCharacterDefinition(dir)).toBeUndefined()
  })
})

describe("readCharacterAssets", () => {
  it("定義が無いときは立ち絵なしで、既定の alt テキストにフォールバックする", () => {
    const assets = readCharacterAssets(dir, "default", "default")

    expect(assets.portrait).toBeUndefined()
    expect(assets.outfitAccent).toBeUndefined()
    expect(assets.altText).toBe("キャラクター（通常）")
  })

  it("定義と立ち絵（SVG）が揃っていれば中身をそのまま持ち出す", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir, "default.svg"), PLAUSIBLE_SVG)

    const assets = readCharacterAssets(dir, "default", "normal")

    expect(assets.portrait).toEqual({ kind: "svg", svgMarkup: PLAUSIBLE_SVG })
    expect(assets.outfitAccent).toBe("#b8c7ff")
    expect(assets.altText).toBe("架空の精霊（通常）")
  })

  it("表情に対応する立ち絵ファイルが無ければ portrait は undefined", () => {
    writeFileSync(
      join(dir, "character.json"),
      JSON.stringify({ name: "架空の精霊", portraits: {}, outfitAccents: {} }),
    )

    const assets = readCharacterAssets(dir, "default", "default")

    expect(assets.portrait).toBeUndefined()
  })

  it("立ち絵ファイルが定義にあってもディスクに無ければ portrait は undefined", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    // default.svg をわざと置かない。

    const assets = readCharacterAssets(dir, "default", "default")

    expect(assets.portrait).toBeUndefined()
  })
})
