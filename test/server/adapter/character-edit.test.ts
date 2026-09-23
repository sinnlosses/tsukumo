import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createCharacterPack,
  deleteCharacterPack,
  editCharacterPack,
  MAX_IMAGE_FILES_PER_PACK,
} from "../../../src/server/adapter/character-edit.ts"
import {
  listCharacterPacks,
  readCharacterPack,
} from "../../../src/server/adapter/character-pack.ts"
import { DEFAULT_BACKGROUND_VEIL } from "../../../src/shared/character-background.ts"
import {
  type CharacterCreateCommand,
  type CharacterDeleteCommand,
  type CharacterEditCommand,
} from "../../../src/shared/command.ts"
import { EXPRESSIONS } from "../../../src/shared/expression.ts"

// フィクスチャは手で書いた架空のパック（実物の素材・人格は使わない）。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  portraits: { default: "default.svg", thinking: "thinking.svg", proud: "proud.svg" },
  outfitAccents: { default: "#b8c7ff" },
})
const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

/** 差し替えに使う架空の PNG（中身は見ないので数バイトでよい）。 */
const PNG_DATA_URL = "data:image/png;base64,AAECAwQ="
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(PLAUSIBLE_SVG).toString("base64")}`
/** 背景の差し替えに使う架空の WebP（中身は見ないので数バイトでよい）。 */
const WEBP_DATA_URL = "data:image/webp;base64,AAECAwQ="

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
  for (const fileName of ["default.svg", "thinking.svg", "proud.svg"]) {
    writeFileSync(join(packDir, fileName), PLAUSIBLE_SVG)
  }
  return packDir
}

/**
 * 立ち絵を全表情そろえ、ミニ立ち絵も持つパックを置く（実際に使われているパックと同じ形）。
 * **背景はまだ無い**ので、ここに背景を1枚足せることが画像の数の上限の下限になる。
 */
function writeFullPack(name: string): string {
  const packDir = join(dir, "bundled", name)
  mkdirSync(packDir, { recursive: true })
  const portraits = Object.fromEntries(
    EXPRESSIONS.map((expression) => [expression, `${expression}.png`]),
  )
  for (const fileName of [...Object.values(portraits), "mini.png"]) {
    writeFileSync(join(packDir, fileName), "x")
  }
  writeFileSync(
    join(packDir, "character.json"),
    JSON.stringify({ name, portraits, mini: "mini.png" }),
  )
  return packDir
}

function setPortrait(
  expression: "default" | "proud",
  image: string,
  pack = "tsukumo",
): CharacterEditCommand {
  return { type: "set-portrait", commandId: "c-1", pack, expression, image }
}

/** 新しいパックを作るコマンド（必須の1枚は境界で required なので、ここでも必ず入る）。 */
function createCharacter(name: string): CharacterCreateCommand {
  return {
    type: "create-character",
    commandId: "c-1",
    name,
    portraits: { default: SVG_DATA_URL },
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
      [],
      setPortrait("proud", PNG_DATA_URL),
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.dir).toBe(join(home(), "tsukumo"))
    expect(edited?.definition?.portraits.proud).toBe("proud.png")
    // 写した先には人格とほかの表情の素材も並んでいる（次の起動で欠けない）。
    expect(edited?.persona).toBe(PERSONA)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(true)
    expect(existsSync(join(home(), "tsukumo", "thinking.svg"))).toBe(true)
    // 同梱側は触っていない。
    expect(readCharacterPack(bundled).definition?.portraits.proud).toBe("proud.svg")
  })

  it("書いた立ち絵の中身が、そのファイル名で読める", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      [],
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
      [],
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

    editCharacterPack(
      readCharacterPack(bundled),
      [],
      setPortrait("proud", PNG_DATA_URL),
      cwd,
      home(),
    )

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
      [],
      setPortrait("proud", PNG_DATA_URL),
      cwd,
      home(),
    )
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const second = editCharacterPack(first, [], setPortrait("default", PNG_DATA_URL), cwd, home())

    expect(second?.definition?.portraits.proud).toBe("proud.png")
    expect(second?.definition?.portraits.default).toBe("default.png")
  })

  it("立ち絵を消すと定義から外れ、ファイルも残らない", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "clear-portrait", commandId: "c-1", pack: "tsukumo", expression: "proud" },
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
      [],
      setPortrait("default", SVG_DATA_URL),
      cwd,
      home(),
    )
    expect(edited).toBeDefined()
    for (let index = 0; index < MAX_IMAGE_FILES_PER_PACK; index += 1) {
      writeFileSync(join(home(), "tsukumo", `spare-${String(index)}.png`), "x")
    }

    expect(
      editCharacterPack(
        readCharacterPack(join(home(), "tsukumo")),
        [],
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
      [],
      setPortrait("default", PNG_DATA_URL, "bare"),
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
      [],
      {
        type: "set-outfit-accent",
        commandId: "c-1",
        pack: "tsukumo",
        outfit: "heavy",
        color: "#ffb3a7",
      },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.outfitAccents.heavy).toBe("#ffb3a7")
    expect(edited?.definition?.outfitAccents.default).toBe("#b8c7ff")
  })
})

describe("editCharacterPack（画面の差し色）", () => {
  it("仕事の差し色（accent）を差し替える", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-accent", commandId: "c-1", pack: "tsukumo", target: "work", color: "#123456" },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.accent).toBe("#123456")
  })

  it("雑談の差し色（chatAccent）を差す", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-accent", commandId: "c-1", pack: "tsukumo", target: "chat", color: "#f2984a" },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.chatAccent).toBe("#f2984a")
  })

  it("雑談の差し色を消すと、仕事の差し色に戻る（chatAccent が undefined になる）", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir, "cwd")

    const withChatAccent = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-accent", commandId: "c-1", pack: "tsukumo", target: "chat", color: "#f2984a" },
      cwd,
      home(),
    )
    expect(withChatAccent).toBeDefined()
    if (withChatAccent === undefined) {
      return
    }
    const cleared = editCharacterPack(
      withChatAccent,
      [],
      { type: "clear-chat-accent", commandId: "c-2", pack: "tsukumo" },
      cwd,
      home(),
    )

    expect(cleared?.definition?.chatAccent).toBeUndefined()
  })
})

describe("editCharacterPack（背景）", () => {
  it("背景を差すと、形式から組み立てた名前で書かれ、定義がそれを指す", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-background", commandId: "c-1", pack: "tsukumo", image: PNG_DATA_URL },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.background?.image).toBe("background.png")
    // 覆いの濃さは書かなくても、読むときに既定へ落ちる（画面からは変えない）。
    expect(edited?.definition?.background?.veil).toBe(DEFAULT_BACKGROUND_VEIL)
    expect(existsSync(join(home(), "tsukumo", "background.png"))).toBe(true)
    // 同梱側は触っていない。
    expect(readCharacterPack(bundled).definition?.background).toBeUndefined()
  })

  it("立ち絵を全表情そろえミニ立ち絵も持つパックでも、背景を差せる", () => {
    const bundled = writeFullPack("tsukumo")

    const edited = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-background", commandId: "c-1", pack: "tsukumo", image: PNG_DATA_URL },
      join(dir, "cwd"),
      home(),
    )

    expect(edited?.definition?.background?.image).toBe("background.png")
  })

  it("形式を変えて差し替えると、参照が外れた古い背景は残らない", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir, "cwd")

    const first = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-background", commandId: "c-1", pack: "tsukumo", image: PNG_DATA_URL },
      cwd,
      home(),
    )
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const second = editCharacterPack(
      first,
      [],
      { type: "set-background", commandId: "c-2", pack: "tsukumo", image: WEBP_DATA_URL },
      cwd,
      home(),
    )

    expect(second?.definition?.background?.image).toBe("background.webp")
    expect(existsSync(join(home(), "tsukumo", "background.png"))).toBe(false)
  })

  it("背景を消すと定義から外れ、ファイルも残らない（立ち絵は残る）", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir, "cwd")

    const withBackground = editCharacterPack(
      readCharacterPack(bundled),
      [],
      { type: "set-background", commandId: "c-1", pack: "tsukumo", image: PNG_DATA_URL },
      cwd,
      home(),
    )
    expect(withBackground).toBeDefined()
    if (withBackground === undefined) {
      return
    }
    const cleared = editCharacterPack(
      withBackground,
      [],
      { type: "clear-background", commandId: "c-2", pack: "tsukumo" },
      cwd,
      home(),
    )

    expect(cleared?.definition?.background).toBeUndefined()
    expect(existsSync(join(home(), "tsukumo", "background.png"))).toBe(false)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(true)
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
        [],
        setPortrait("proud", PNG_DATA_URL, "local"),
        cwd,
        home(),
      ),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
  })

  it("使用中でないパックとして起動先の characters/local を指しても書かない", () => {
    const cwd = join(dir, "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    const current = readCharacterPack(writeBundledPack("tsukumo"))

    expect(
      editCharacterPack(
        current,
        [current, readCharacterPack(localDir)],
        setPortrait("proud", PNG_DATA_URL, "local"),
        cwd,
        home(),
      ),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
  })

  it("一覧に無いパックの名前は書かない（名前からディレクトリを作らない）", () => {
    const current = readCharacterPack(writeBundledPack("tsukumo"))

    expect(
      editCharacterPack(
        current,
        [current],
        setPortrait("proud", PNG_DATA_URL, "fictional-missing"),
        join(dir, "cwd"),
        home(),
      ),
    ).toBeUndefined()
    expect(existsSync(join(home(), "fictional-missing"))).toBe(false)
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
  })
})

describe("editCharacterPack（使用中でないパック）", () => {
  it("立ち絵・差し色・背景を変えると、ホームのそのパックの下だけが書き変わる", () => {
    const cwd = join(dir, "cwd")
    const roots = { bundled: join(dir, "bundled"), home: home() }
    const current = readCharacterPack(writeBundledPack("tsukumo"))
    writeBundledPack("fictional-other")
    // 画面が1回ごとに一覧を読み直すのと同じく、編集のたびに一覧を引き直して渡す。
    const edit = (command: CharacterEditCommand) =>
      editCharacterPack(current, listCharacterPacks(cwd, roots), command, cwd, home())

    edit(setPortrait("proud", PNG_DATA_URL, "fictional-other"))
    edit({
      type: "set-accent",
      commandId: "c-2",
      pack: "fictional-other",
      target: "work",
      color: "#123456",
    })
    const edited = edit({
      type: "set-background",
      commandId: "c-3",
      pack: "fictional-other",
      image: PNG_DATA_URL,
    })

    expect(edited?.dir).toBe(join(home(), "fictional-other"))
    expect(edited?.definition?.portraits.proud).toBe("proud.png")
    expect(edited?.definition?.accent).toBe("#123456")
    expect(edited?.definition?.background?.image).toBe("background.png")
    // 写した先には人格も並ぶ（次にそのパックへ切り替えたとき欠けない）。
    expect(edited?.persona).toBe(PERSONA)
    // 使用中のパックはホームへ写されず、同梱のどちらのパックも触っていない。
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
    expect(readCharacterPack(current.dir).definition).toEqual(current.definition)
    const bundledOther = readCharacterPack(join(dir, "bundled", "fictional-other")).definition
    expect(bundledOther?.portraits.proud).toBe("proud.svg")
    expect(bundledOther?.accent).toBeUndefined()
    expect(bundledOther?.background).toBeUndefined()
  })
})

describe("createCharacterPack", () => {
  it("ホームに名前のディレクトリを作り、必須の1枚と定義を書く", () => {
    const created = createCharacterPack(createCharacter("fictional-2"), [], home())

    expect(created?.dir).toBe(join(home(), "fictional-2"))
    // 表示名はディレクトリ名と同じ（画面から表示名を変える口はまだ無い）。
    expect(created?.definition?.name).toBe("fictional-2")
    // 立ち絵のファイル名は表情と形式から組み立てる（届いた文字列がパスの一部にならない）。
    expect(created?.definition?.portraits.default).toBe("default.svg")
    expect(created?.definition?.outfitAccents.default).toBe("#b8c7ff")
    expect(readFileSync(join(home(), "fictional-2", "default.svg"), "utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("作ったパックは切り替えの一覧に出て、次の起動でも残る", () => {
    const cwd = join(dir, "cwd")
    writeBundledPack("tsukumo")
    createCharacterPack(createCharacter("fictional-2"), ["tsukumo"], home())

    const packs = listCharacterPacks(cwd, { bundled: join(dir, "bundled"), home: home() })
    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo", "fictional-2"])
    expect(packs[1]?.definition?.portraits.default).toBe("default.svg")
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

describe("deleteCharacterPack", () => {
  const cwd = (): string => join(dir, "cwd")
  const roots = (): { readonly bundled: string; readonly home: string } => ({
    bundled: join(dir, "bundled"),
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

  function deleteCommand(pack: string): CharacterDeleteCommand {
    return { type: "delete-character", commandId: "c-1", pack }
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
    const spirit = readCharacterPack(join(dir, "bundled", "spirit"))
    editCharacterPack(
      spirit,
      listCharacterPacks(cwd(), roots()),
      setPortrait("proud", PNG_DATA_URL, "tsukumo"),
      cwd(),
      home(),
    )

    const { removal, after } = deleteFromList("spirit", "tsukumo")

    expect(removal).toBe("revert-to-bundled")
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
    const reverted = after.find((listed) => listed.name === "tsukumo")
    expect(reverted?.dir).toBe(join(dir, "bundled", "tsukumo"))
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
    expect(existsSync(join(dir, "bundled", "spirit", "character.json"))).toBe(true)
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

  it("一覧に無いパック（パスのような名前を含む）は断り、何も消さない", () => {
    writeBundledPack("tsukumo")
    writePackUnder(home(), "fictional-2")
    // 一覧に出ない、定義の無いディレクトリ（名前だけ一致しても消さない）。
    mkdirSync(join(home(), "broken"), { recursive: true })

    for (const name of ["missing", "broken", "..", "../home"]) {
      expect(deleteFromList("tsukumo", name).removal).toBeUndefined()
    }
    expect(existsSync(join(home(), "fictional-2", "character.json"))).toBe(true)
    expect(existsSync(join(home(), "broken"))).toBe(true)
  })

  it("ホームの版がシンボリックリンクなら、消えるのはリンクだけで指している先は残る", () => {
    writeBundledPack("tsukumo")
    const outside = writePackUnder(join(dir, "outside"), "linked")
    mkdirSync(home(), { recursive: true })
    symlinkSync(outside, join(home(), "linked"))

    const { removal, names } = deleteFromList("tsukumo", "linked")

    expect(removal).toBe("delete")
    expect(names).toEqual(["tsukumo"])
    expect(existsSync(join(outside, "character.json"))).toBe(true)
  })
})
