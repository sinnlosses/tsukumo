import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { omit } from "remeda"
import { describe, expect, it } from "vitest"

import type { editCharacterPack } from "../../../../src/server/character-pack/adapter/character-edit.ts"
import type { CharacterDefinition } from "../../../../src/shared/character-pack/character-definition.ts"
import type { CharacterEdit } from "../../../../src/shared/contract/character-pack.ts"
import {
  PNG_DATA_URL,
  TSUKUMO,
  useCharacterEditHarness,
  WEBP_DATA_URL,
} from "../../../fixture/character-edit-harness.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"

const { dir, home, writeBundledPack, writeFullPack, editInHome } =
  useCharacterEditHarness("character-edit-images")

describe("editCharacterPack（背景）", () => {
  it("背景を差すと、覆いの濃さは書かなくても読むときに既定へ落ちる（画面からは変えない）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setBackground",
      pack: TSUKUMO,
      image: PNG_DATA_URL,
    })

    expect(edited?.definition?.background?.veil).toBe(0.75)
  })

  it("立ち絵を全表情そろえミニ立ち絵も持つパックでも、背景を差せる", () => {
    const bundled = writeFullPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setBackground",
      pack: TSUKUMO,
      image: PNG_DATA_URL,
    })

    expect(edited?.definition?.background?.image).toBe("background.png")
  })
})

describe("editCharacterPack（背景・顔・ミニ立ち絵）", () => {
  describe.each([
    {
      name: "背景",
      key: "background" as const,
      set: (image: string): CharacterEdit => ({ kind: "setBackground", pack: TSUKUMO, image }),
      clear: { kind: "clearBackground", pack: TSUKUMO } satisfies CharacterEdit,
      oldFile: "background.webp",
      newFile: "background.png",
      imageOf: (definition?: CharacterDefinition) => definition?.background?.image,
    },
    {
      name: "顔",
      key: "face" as const,
      set: (image: string): CharacterEdit => ({ kind: "setFace", pack: TSUKUMO, image }),
      clear: { kind: "clearFace", pack: TSUKUMO } satisfies CharacterEdit,
      oldFile: "face.svg",
      newFile: "face.png",
      imageOf: (definition?: CharacterDefinition) => definition?.face,
    },
    {
      name: "ミニ立ち絵",
      key: "mini" as const,
      set: (image: string): CharacterEdit => ({ kind: "setMini", pack: TSUKUMO, image }),
      clear: { kind: "clearMini", pack: TSUKUMO } satisfies CharacterEdit,
      oldFile: "mini.svg",
      newFile: "mini.png",
      imageOf: (definition?: CharacterDefinition) => definition?.mini,
    },
  ])("editCharacterPack（$name の差し替えと消去）", (row) => {
    /** 顔・背景（veil）・ミニ立ち絵・差し色・呼び名をすべて持つパックを置く。 */
    function writeRichPack(): string {
      const packDir = join(dir(), "bundled", "tsukumo")
      mkdirSync(packDir, { recursive: true })
      for (const fileName of ["default.svg", "mini.svg", "face.svg", "background.webp"]) {
        writeFileSync(join(packDir, fileName), "x")
      }
      writeFileSync(
        join(packDir, "character.json"),
        JSON.stringify({
          name: "tsukumo",
          accent: "#b8c7ff",
          portraits: { default: "default.svg" },
          mini: "mini.svg",
          miniCall: "架空の使い魔",
          face: "face.svg",
          background: { image: "background.webp", veil: 0.8 },
        }),
      )
      return packDir
    }

    function expectOtherFieldsKept(
      edited: ReturnType<typeof editCharacterPack>,
      original: ReturnType<typeof readPackAt>,
    ): void {
      const withoutChanged = (definition?: CharacterDefinition) =>
        definition === undefined ? undefined : omit(definition, [row.key])
      expect(edited?.definition).toBeDefined()
      expect(withoutChanged(edited?.definition)).toEqual(withoutChanged(original.definition))
      expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(true)
    }

    it("差すと、形式から組み立てた名前で書かれ、定義がそれを指す", () => {
      const bundled = writeBundledPack("tsukumo")

      const edited = editInHome(readPackAt(bundled), row.set(PNG_DATA_URL))

      expect(row.imageOf(edited?.definition)).toBe(row.newFile)
      expect(existsSync(join(home(), "tsukumo", row.newFile))).toBe(true)
      expect(row.imageOf(readPackAt(bundled).definition)).toBeUndefined()
    })

    it("形式を変えて差し替えると、参照が外れた古いファイルは残らず、ほかの欄は落ちない", () => {
      const original = readPackAt(writeRichPack())

      const edited = editInHome(original, row.set(PNG_DATA_URL))

      expect(row.imageOf(edited?.definition)).toBe(row.newFile)
      expect(existsSync(join(home(), "tsukumo", row.newFile))).toBe(true)
      expect(existsSync(join(home(), "tsukumo", row.oldFile))).toBe(false)
      expectOtherFieldsKept(edited, original)
    })

    it("消すと定義から外れ、ファイルも残らず、ほかの欄は落ちない", () => {
      const original = readPackAt(writeRichPack())

      const cleared = editInHome(original, row.clear)

      expect(row.imageOf(cleared?.definition)).toBeUndefined()
      expect(existsSync(join(home(), "tsukumo", row.oldFile))).toBe(false)
      expectOtherFieldsKept(cleared, original)
    })
  })
})

describe("editCharacterPack（ミニ立ち絵の画像の種類）", () => {
  it("受け付けない種類の画像は書かない", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setMini",
      pack: TSUKUMO,
      image: WEBP_DATA_URL,
    })

    expect(edited).toBeUndefined()
    expect(existsSync(join(home(), "tsukumo", "mini.webp"))).toBe(false)
  })
})
