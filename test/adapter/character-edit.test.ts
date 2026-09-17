import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createCharacterPack,
  editCharacterPack,
  MAX_PORTRAIT_FILES_PER_PACK,
} from "../../src/adapter/character-edit.ts"
import { listCharacterPacks, readCharacterPack } from "../../src/adapter/character-pack.ts"
import {
  type CharacterCreateCommand,
  type CharacterEditCommand,
} from "../../src/protocol/command.ts"

// フィクスチャは手で書いた架空のパック（実物の素材・人格は使わない）。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  portraits: { default: "default.svg", working: "working.svg", proud: "proud.svg" },
  outfitAccents: { default: "#b8c7ff" },
})
const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

/** 差し替えに使う架空の PNG（中身は見ないので数バイトでよい）。 */
const PNG_DATA_URL = "data:image/png;base64,AAECAwQ="
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(PLAUSIBLE_SVG).toString("base64")}`

let dir: string

/** 書き込み先の親（本物の `~/.tsukumo/characters` の代わり）。 */
function home(): string {
  return join(dir, "home")
}

/** 同梱のパックを1つ置く（定義・人格・立ち絵3枚）。 */
function writeBundledPack(name: string): string {
  const packDir = join(dir, "bundled", name)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, "character.json"), DEFINITION_JSON)
  writeFileSync(join(packDir, "persona.md"), PERSONA)
  for (const fileName of ["default.svg", "working.svg", "proud.svg"]) {
    writeFileSync(join(packDir, fileName), PLAUSIBLE_SVG)
  }
  return packDir
}

function setPortrait(expression: "default" | "proud", image: string): CharacterEditCommand {
  return { type: "set-portrait", commandId: "c-1", expression, image }
}

/** 新しいパックを作るコマンド（必須の2枚は境界で required なので、ここでも必ず両方入る）。 */
function createCharacter(name: string): CharacterCreateCommand {
  return {
    type: "create-character",
    commandId: "c-1",
    name,
    portraits: { default: SVG_DATA_URL, working: PNG_DATA_URL },
    accent: "#b8c7ff",
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-character-edit-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("editCharacterPack（立ち絵）", () => {
  it("同梱のパックを直さず、ホームへ写してから書く（人格も一緒に写る）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      setPortrait("proud", PNG_DATA_URL),
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.dir).toBe(join(home(), "tsukumo"))
    expect(edited?.definition?.portraits.proud).toBe("proud.png")
    // 写した先には人格とほかの表情の素材も並んでいる（次の起動で欠けない）。
    expect(edited?.persona).toBe(PERSONA)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(true)
    expect(existsSync(join(home(), "tsukumo", "working.svg"))).toBe(true)
    // 同梱側は触っていない。
    expect(readCharacterPack(bundled).definition?.portraits.proud).toBe("proud.svg")
  })

  it("書いた立ち絵の中身が、そのファイル名で読める", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      setPortrait("default", SVG_DATA_URL),
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.portraits.default).toBe("default.svg")
    expect(readFileSync(join(home(), "tsukumo", "default.svg"), "utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("形式を変えて差し替えると、参照が外れた古いファイルは残らない", () => {
    const bundled = writeBundledPack("tsukumo")

    editCharacterPack(
      readCharacterPack(bundled),
      setPortrait("default", PNG_DATA_URL),
      join(dir, "cwd"),
      home(),
    )

    expect(existsSync(join(home(), "tsukumo", "default.png"))).toBe(true)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(false)
  })

  it("保存した値は次の起動で読まれる（ホームが同梱に勝つ）", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir, "cwd")

    editCharacterPack(readCharacterPack(bundled), setPortrait("proud", PNG_DATA_URL), cwd, home())

    // 起こし直したときと同じ手順で読み直す。
    const packs = listCharacterPacks(cwd, { bundled: join(dir, "bundled"), home: home() })
    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo"])
    expect(packs[0]?.dir).toBe(join(home(), "tsukumo"))
    expect(packs[0]?.definition?.portraits.proud).toBe("proud.png")
    expect(packs[0]?.persona).toBe(PERSONA)
  })

  it("2回目の編集ではホームの版を土台にする（前の変更を上書きしない）", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir, "cwd")

    const first = editCharacterPack(
      readCharacterPack(bundled),
      setPortrait("proud", PNG_DATA_URL),
      cwd,
      home(),
    )
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const second = editCharacterPack(first, setPortrait("default", PNG_DATA_URL), cwd, home())

    expect(second?.definition?.portraits.proud).toBe("proud.png")
    expect(second?.definition?.portraits.default).toBe("default.png")
  })

  it("立ち絵を消すと定義から外れ、ファイルも残らない", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      { type: "clear-portrait", commandId: "c-1", expression: "proud" },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.portraits.proud).toBeUndefined()
    expect(edited?.definition?.portraits.default).toBe("default.svg")
    expect(existsSync(join(home(), "tsukumo", "proud.svg"))).toBe(false)
  })

  it("立ち絵の数が上限に達していたら、新しい名前では受け付けない", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir, "cwd")
    // まず写させてから、上限まで画像で埋める。
    const edited = editCharacterPack(
      readCharacterPack(bundled),
      setPortrait("default", SVG_DATA_URL),
      cwd,
      home(),
    )
    expect(edited).toBeDefined()
    for (let index = 0; index < MAX_PORTRAIT_FILES_PER_PACK; index += 1) {
      writeFileSync(join(home(), "tsukumo", `spare-${String(index)}.png`), "x")
    }

    expect(
      editCharacterPack(
        readCharacterPack(join(home(), "tsukumo")),
        setPortrait("proud", PNG_DATA_URL),
        cwd,
        home(),
      ),
    ).toBeUndefined()
  })

  it("定義がまだ無いパックにも立ち絵を足せる", () => {
    const empty = join(dir, "bundled", "bare")
    mkdirSync(empty, { recursive: true })

    const edited = editCharacterPack(
      readCharacterPack(empty),
      setPortrait("default", PNG_DATA_URL),
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.portraits.default).toBe("default.png")
  })
})

describe("editCharacterPack（差し色）", () => {
  it("衣装ごとの差し色を差し替え、ほかの衣装はそのまま", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      { type: "set-outfit-accent", commandId: "c-1", outfit: "heavy", color: "#ffb3a7" },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.outfitAccents.heavy).toBe("#ffb3a7")
    expect(edited?.definition?.outfitAccents.default).toBe("#b8c7ff")
  })
})

describe("editCharacterPack（受け付けないもの）", () => {
  it("起動先の characters/local のパックは書かない（ホームに書いても次の起動で負けるため）", () => {
    const cwd = join(dir, "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)

    expect(
      editCharacterPack(
        readCharacterPack(localDir),
        setPortrait("proud", PNG_DATA_URL),
        cwd,
        home(),
      ),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
  })
})

describe("createCharacterPack", () => {
  it("ホームに名前のディレクトリを作り、必須の2枚と定義を書く", () => {
    const created = createCharacterPack(createCharacter("fictional-2"), [], home())

    expect(created?.dir).toBe(join(home(), "fictional-2"))
    // 表示名はディレクトリ名と同じ（画面から表示名を変える口はまだ無い）。
    expect(created?.definition?.name).toBe("fictional-2")
    // 立ち絵のファイル名は表情と形式から組み立てる（届いた文字列がパスの一部にならない）。
    expect(created?.definition?.portraits.default).toBe("default.svg")
    expect(created?.definition?.portraits.working).toBe("working.png")
    expect(created?.definition?.outfitAccents.default).toBe("#b8c7ff")
    expect(readFileSync(join(home(), "fictional-2", "default.svg"), "utf8")).toBe(PLAUSIBLE_SVG)
    expect(existsSync(join(home(), "fictional-2", "working.png"))).toBe(true)
  })

  it("作ったパックは切り替えの一覧に出て、次の起動でも残る", () => {
    const cwd = join(dir, "cwd")
    writeBundledPack("tsukumo")
    createCharacterPack(createCharacter("fictional-2"), ["tsukumo"], home())

    const packs = listCharacterPacks(cwd, { bundled: join(dir, "bundled"), home: home() })
    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo", "fictional-2"])
    expect(packs[1]?.definition?.portraits.working).toBe("working.png")
  })

  it("既にある名前は弾く（後勝ちで既存のパックを黙って隠さない）", () => {
    writeBundledPack("tsukumo")

    expect(createCharacterPack(createCharacter("tsukumo"), ["tsukumo"], home())).toBeUndefined()
    // 書き込み先には何も作らない（同梱のパックも触っていない）。
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
    expect(readCharacterPack(join(dir, "bundled", "tsukumo")).definition?.portraits.default).toBe(
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
    writeFileSync(join(dir, "blocked"), "x")

    expect(
      createCharacterPack(createCharacter("fictional-2"), [], join(dir, "blocked")),
    ).toBeUndefined()
    expect(existsSync(join(dir, "blocked", "fictional-2"))).toBe(false)
  })
})
