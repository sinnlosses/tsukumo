import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  characterChangedEvent,
  readCharacterPack,
  readCharacterPackFile,
} from "../../src/core/character-pack.ts"

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
  dir = mkdtempSync(join(tmpdir(), "tsukumo-character-pack-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("readCharacterPack", () => {
  it("character.json を読んでパースする", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const pack = readCharacterPack(dir)

    expect(pack.definition?.name).toBe("架空の精霊")
  })

  it("character.json が無ければ definition が undefined", () => {
    expect(readCharacterPack(dir).definition).toBeUndefined()
  })

  it("character.json が壊れていれば definition が undefined", () => {
    writeFileSync(join(dir, "character.json"), "{壊れた json")

    expect(readCharacterPack(dir).definition).toBeUndefined()
  })
})

describe("characterChangedEvent", () => {
  it("portraits の値をファイル名でなく /character/<file> の URL にする", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const event = characterChangedEvent(readCharacterPack(dir))

    expect(event).toEqual({
      kind: "character-changed",
      name: "架空の精霊",
      expressions: ["default", "working"],
      portraits: {
        default: "/character/default.svg",
        working: "/character/working.svg",
        proud: undefined,
        flustered: undefined,
      },
      outfitAccents: {
        default: "#b8c7ff",
        light: undefined,
        normal: "#b8c7ff",
        heavy: undefined,
      },
    })
  })

  it("定義が無くても、立ち絵なしの形で流せる", () => {
    const event = characterChangedEvent(readCharacterPack(dir))

    expect(event).toMatchObject({
      kind: "character-changed",
      name: undefined,
      expressions: ["default"],
    })
  })
})

describe("readCharacterPackFile", () => {
  it("character.json の portraits にあるファイルを読める", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir, "default.svg"), PLAUSIBLE_SVG)

    const file = readCharacterPackFile(readCharacterPack(dir), "default.svg")

    expect(file?.contentType).toBe("image/svg+xml; charset=utf-8")
    expect(file?.content.toString("utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("定義に無いファイル名は undefined（呼び出し側が404にする）", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir, "secret.svg"), PLAUSIBLE_SVG)

    expect(readCharacterPackFile(readCharacterPack(dir), "secret.svg")).toBeUndefined()
  })

  it("`..` を含む要求は、パスから組み立てないので自然に undefined になる", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    expect(readCharacterPackFile(readCharacterPack(dir), "../character.json")).toBeUndefined()
  })

  it("定義にあってもディスクに無ければ undefined", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    // default.svg をわざと置かない。

    expect(readCharacterPackFile(readCharacterPack(dir), "default.svg")).toBeUndefined()
  })

  it("定義が無ければ何も配らない", () => {
    expect(readCharacterPackFile(readCharacterPack(dir), "default.svg")).toBeUndefined()
  })
})
