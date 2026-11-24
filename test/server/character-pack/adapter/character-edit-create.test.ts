import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createCharacterPack } from "../../../../src/server/character-pack/adapter/character-edit.ts"
import { listCharacterPacks } from "../../../../src/server/character-pack/adapter/character-pack.ts"
import { PLAUSIBLE_SVG } from "../../../fixture/bundled-character-pack.ts"
import {
  createCharacter,
  useCharacterEditHarness,
} from "../../../fixture/character-edit-harness.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"

const { dir, home, writeBundledPack } = useCharacterEditHarness("character-edit-create")

describe("createCharacterPack", () => {
  it("ホームに id のディレクトリを作り、必須の1枚・画面の差し色2つ・定義を書く", () => {
    const created = createCharacterPack(createCharacter("fictional-2"), [], home())

    expect(created?.dir).toBe(join(home(), "fictional-2"))
    // 名前を空にすると character.json に name を書かない（読む側が id へ落とす。docs/architecture/character-pack.md「画面から作るときの置き場と受け取り方」）。
    expect(created?.definition?.name).toBeUndefined()
    // 立ち絵のファイル名は表情と形式から組み立てる（届いた文字列がパスの一部にならない）。
    expect(created?.definition?.portraits.default).toBe("default.svg")
    // 画面の差し色は仕事・雑談の両方が書かれる。
    expect(created?.definition?.accent).toBe("#b8c7ff")
    expect(created?.definition?.chatAccent).toBe("#eaa77a")
    expect(readFileSync(join(home(), "fictional-2", "default.svg"), "utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("id とは別の表示名と自己紹介文を指定すると character.json に書かれる", () => {
    const created = createCharacterPack(
      createCharacter("fictional-2", { name: "架空の2号", tagline: "架空の一言" }),
      [],
      home(),
    )

    expect(created?.dir).toBe(join(home(), "fictional-2"))
    expect(created?.definition?.name).toBe("架空の2号")
    expect(created?.definition?.tagline).toBe("架空の一言")
  })

  it("ペルソナを渡すと persona.md に書き、読み直したパックの人格に載る", () => {
    const created = createCharacterPack(
      createCharacter("fictional-2", { persona: "# 架空の2号\n\n架空の人格。" }),
      [],
      home(),
    )

    expect(readFileSync(join(home(), "fictional-2", "persona.md"), "utf8")).toBe(
      "# 架空の2号\n\n架空の人格。\n",
    )
    expect(created?.persona).toBe("# 架空の2号\n\n架空の人格。\n")
  })

  it("ペルソナが空（空白だけも）なら persona.md を書かない", () => {
    for (const [id, persona] of [
      ["fictional-2", ""],
      ["fictional-3", " \n\n"],
    ] as const) {
      const created = createCharacterPack(createCharacter(id, { persona }), [], home())

      expect(existsSync(join(home(), id, "persona.md"))).toBe(false)
      expect(created?.persona).toBeUndefined()
    }
  })

  it("作ったパックは切り替えの一覧に出て、次の起動でも残る", () => {
    const cwd = join(dir(), "cwd")
    writeBundledPack("tsukumo")
    createCharacterPack(createCharacter("fictional-2"), ["tsukumo"], home())

    const packs = listCharacterPacks(cwd, { bundled: join(dir(), "bundled"), home: home() })
    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo", "fictional-2"])
    expect(packs[1]?.definition?.portraits.default).toBe("default.svg")
  })

  it("既にある名前は弾く（後勝ちで既存のパックを黙って隠さない）", () => {
    writeBundledPack("tsukumo")

    expect(createCharacterPack(createCharacter("tsukumo"), ["tsukumo"], home())).toBeUndefined()
    // 書き込み先には何も作らない（同梱のパックも触っていない）。
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
    expect(readPackAt(join(dir(), "bundled", "tsukumo")).definition?.portraits.default).toBe(
      "default.svg",
    )
  })

  it("一覧に無くても、書き込み先に同じ名前のディレクトリがあれば弾く", () => {
    mkdirSync(join(home(), "fictional-2"), { recursive: true })
    writeFileSync(join(home(), "fictional-2", "keep.txt"), "先にあったもの")

    expect(createCharacterPack(createCharacter("fictional-2"), [], home())).toBeUndefined()
    expect(existsSync(join(home(), "fictional-2", "keep.txt"))).toBe(true)
  })

  it("立ち絵を書けなかったら、定義の無いディレクトリを残さない", () => {
    // 書き込み先の親をファイルにしておくと、ディレクトリを作る時点で失敗する。
    writeFileSync(join(dir(), "blocked"), "x")

    expect(
      createCharacterPack(createCharacter("fictional-2"), [], join(dir(), "blocked")),
    ).toBeUndefined()
    expect(existsSync(join(dir(), "blocked", "fictional-2"))).toBe(false)
  })
})
