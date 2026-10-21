import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  deleteCharacterPack,
  editCharacterPack,
} from "../../../../src/server/character-pack/adapter/character-edit.ts"
import {
  listCharacterPacks,
  readCharacterPack,
} from "../../../../src/server/character-pack/adapter/character-pack.ts"
import type { CharacterDelete } from "../../../../src/shared/contract/character-pack.ts"
import {
  PERSONA,
  PLAUSIBLE_SVG,
  writeBundledPackUnder,
} from "../../../fixture/bundled-character-pack.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

/** 差し替えに使う架空の PNG（中身は見ないので数バイトでよい）。 */
const PNG_DATA_URL = "data:image/png;base64,AAECAwQ="

const dir = useTempDir("character-delete")

/** 書き込み先の親（本物の `~/.tsukumo/characters` の代わり）。 */
function home(): string {
  return join(dir(), "home")
}

function writeBundledPack(name: string): string {
  return writeBundledPackUnder(join(dir(), "bundled"), name)
}

describe("deleteCharacterPack", () => {
  const cwd = (): string => join(dir(), "cwd")
  const roots = (): { readonly bundled: string; readonly home: string } => ({
    bundled: join(dir(), "bundled"),
    home: home(),
  })

  /** 画面から作ったのと同じ形のパックを、置き場 `root` の下に置く（定義と立ち絵1枚）。 */
  function writePackUnder(root: string, name: string): string {
    const packDir = join(root, name)
    mkdirSync(packDir, { recursive: true })
    writeFileSync(
      join(packDir, "character.json"),
      JSON.stringify({ name, portraits: { default: "default.svg" } }),
    )
    writeFileSync(join(packDir, "default.svg"), PLAUSIBLE_SVG)
    return packDir
  }

  function deleteCommand(pack: string): CharacterDelete {
    return { pack: characterPackName(pack) }
  }

  /** 一覧を読み、`currentName` を使用中にして `pack` を消す（消したあとの一覧の名前も返す）。 */
  function deleteFromList(currentName: string, pack: string) {
    const packs = listCharacterPacks(cwd(), roots())
    const current = packs.find((listed) => listed.name === currentName)
    if (current === undefined) {
      throw new Error(`テストの前提: ${currentName} が一覧に無い`)
    }
    const removal = deleteCharacterPack(current, packs, deleteCommand(pack), roots())
    const after = listCharacterPacks(cwd(), roots())
    return { removal, after, names: after.map((listed) => listed.name) }
  }

  it("ホームにしか無いパックを消すと、ディレクトリごと消えて一覧からも消える", () => {
    writeBundledPack("tsukumo")
    writePackUnder(home(), "fictional-2")

    const { removal, names } = deleteFromList("tsukumo", "fictional-2")

    expect(removal).toBe("delete")
    expect(existsSync(join(home(), "fictional-2"))).toBe(false)
    expect(names).toEqual(["tsukumo"])
  })

  it("同梱を画面で直したホームの版を消すと、同梱の版が一覧に戻る（同梱のディレクトリは残る）", () => {
    writeBundledPack("tsukumo")
    writeBundledPack("spirit")
    // 同梱の tsukumo を画面で直す（ホームへ写ってから書かれる）。
    const spirit = readCharacterPack(join(dir(), "bundled", "spirit"))
    editCharacterPack(
      spirit,
      listCharacterPacks(cwd(), roots()),
      {
        kind: "setPortrait",
        pack: characterPackName("tsukumo"),
        expression: "proud",
        image: PNG_DATA_URL,
      },
      cwd(),
      home(),
    )

    const { removal, after } = deleteFromList("spirit", "tsukumo")

    expect(removal).toBe("revert-to-bundled")
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
    const reverted = after.find((listed) => listed.name === "tsukumo")
    expect(reverted?.dir).toBe(join(dir(), "bundled", "tsukumo"))
    expect(reverted?.definition?.portraits.proud).toBe("proud.svg")
    expect(reverted?.persona).toBe(PERSONA)
  })

  it("使用中のパックは断り、ファイルが残る", () => {
    writeBundledPack("tsukumo")
    writePackUnder(home(), "fictional-2")

    const { removal, names } = deleteFromList("fictional-2", "fictional-2")

    expect(removal).toBeUndefined()
    expect(existsSync(join(home(), "fictional-2", "character.json"))).toBe(true)
    expect(names).toEqual(["tsukumo", "fictional-2"])
  })

  it("同梱にしか無いパックは断り、同梱のファイルが残る", () => {
    writeBundledPack("tsukumo")
    writeBundledPack("spirit")

    const { removal } = deleteFromList("tsukumo", "spirit")

    expect(removal).toBeUndefined()
    expect(existsSync(join(dir(), "bundled", "spirit", "character.json"))).toBe(true)
  })

  it("起動先の characters/local は、ホームに同じ名前があっても断り、どちらのファイルも残る", () => {
    writeBundledPack("tsukumo")
    writePackUnder(join(cwd(), "characters"), "local")
    writePackUnder(home(), "local")

    const { removal } = deleteFromList("tsukumo", "local")

    expect(removal).toBeUndefined()
    expect(existsSync(join(cwd(), "characters", "local", "character.json"))).toBe(true)
    expect(existsSync(join(home(), "local", "character.json"))).toBe(true)
  })

  it("一覧に無いパックは断り、何も消さない", () => {
    writeBundledPack("tsukumo")
    writePackUnder(home(), "fictional-2")
    // 一覧に出ない、定義の無いディレクトリ（名前だけ一致しても消さない）。
    mkdirSync(join(home(), "broken"), { recursive: true })

    for (const name of ["missing", "broken"]) {
      expect(deleteFromList("tsukumo", name).removal).toBeUndefined()
    }
    expect(existsSync(join(home(), "fictional-2", "character.json"))).toBe(true)
    expect(existsSync(join(home(), "broken"))).toBe(true)
  })

  it("ホームの版がシンボリックリンクなら、消えるのはリンクだけで指している先は残る", () => {
    writeBundledPack("tsukumo")
    const outside = writePackUnder(join(dir(), "outside"), "linked")
    mkdirSync(home(), { recursive: true })
    symlinkSync(outside, join(home(), "linked"))

    const { removal, names } = deleteFromList("tsukumo", "linked")

    expect(removal).toBe("delete")
    expect(names).toEqual(["tsukumo"])
    expect(existsSync(join(outside, "character.json"))).toBe(true)
  })
})
