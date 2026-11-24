// character-edit の単体テストが共有する下ごしらえ（書き込み先のホーム・同梱パック・編集コマンドの組み立て）。

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { editCharacterPack } from "../../src/server/character-pack/adapter/character-edit.ts"
import { EXPRESSIONS } from "../../src/shared/character-pack/expression.ts"
import type { CharacterCreate, CharacterEdit } from "../../src/shared/contract/character-pack.ts"
import { PLAUSIBLE_SVG, writeBundledPackUnder } from "./bundled-character-pack.ts"
import { characterPackName } from "./character.ts"
import { useTempDir } from "./temp-dir.ts"

/** 差し替えに使う架空の PNG（中身は見ないので数バイトでよい）。 */
export const PNG_DATA_URL = "data:image/png;base64,AAECAwQ="
export const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(PLAUSIBLE_SVG).toString("base64")}`
/** 背景の差し替えに使う架空の WebP（中身は見ないので数バイトでよい）。 */
export const WEBP_DATA_URL = "data:image/webp;base64,AAECAwQ="

export const TSUKUMO = characterPackName("tsukumo")

export function setPortrait(
  expression: "default" | "proud",
  image: string,
  pack = "tsukumo",
): CharacterEdit {
  return { kind: "setPortrait", pack: characterPackName(pack), expression, image }
}

/** 新しいパックを作るコマンド。名前と自己紹介文は既定で空で、試すテストだけ `overrides` で足す。 */
export function createCharacter(
  id: string,
  overrides: Partial<CharacterCreate> = {},
): CharacterCreate {
  return {
    id: characterPackName(id),
    name: "",
    tagline: "",
    portraits: { default: SVG_DATA_URL },
    accent: "#b8c7ff",
    chatAccent: "#eaa77a",
    persona: "",
    ...overrides,
  }
}

/** ファイルの最上位で呼ぶ。テストごとの一時ディレクトリの下に、書き込み先のホームと同梱側を用意する。 */
export function useCharacterEditHarness(name: string) {
  const dir = useTempDir(name)

  /** 書き込み先の親（本物の `~/.tsukumo/characters` の代わり）。 */
  function home(): string {
    return join(dir(), "home")
  }

  /** 同梱のパックを1つ置く（定義・人格・立ち絵3枚）。 */
  function writeBundledPack(packName: string): string {
    return writeBundledPackUnder(join(dir(), "bundled"), packName)
  }

  /**
   * 立ち絵を全表情そろえ、ミニ立ち絵も持つパックを置く（実際に使われているパックと同じ形）。
   * 背景はまだ無いので、ここに背景を1枚足せることが画像の数の上限の下限になる。
   */
  function writeFullPack(packName: string): string {
    const packDir = join(dir(), "bundled", packName)
    mkdirSync(packDir, { recursive: true })
    const portraits = Object.fromEntries(
      EXPRESSIONS.map((expression) => [expression, `${expression}.png`]),
    )
    for (const fileName of [...Object.values(portraits), "mini.png"]) {
      writeFileSync(join(packDir, fileName), "x")
    }
    writeFileSync(
      join(packDir, "character.json"),
      JSON.stringify({ name: packName, portraits, mini: "mini.png" }),
    )
    return packDir
  }

  function editInHome(
    pack: Parameters<typeof editCharacterPack>[0],
    command: CharacterEdit,
    packs: Parameters<typeof editCharacterPack>[1] = [],
  ): ReturnType<typeof editCharacterPack> {
    return editCharacterPack(pack, packs, command, join(dir(), "cwd"), home())
  }

  return { dir, home, writeBundledPack, writeFullPack, editInHome }
}
