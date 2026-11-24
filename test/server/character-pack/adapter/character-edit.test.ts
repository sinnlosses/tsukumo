import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { editCharacterPack } from "../../../../src/server/character-pack/adapter/character-edit.ts"
import { listCharacterPacks } from "../../../../src/server/character-pack/adapter/character-pack.ts"
import { EXPRESSIONS } from "../../../../src/shared/character-pack/expression.ts"
import { REMEMBERED_SECTION_HEADING } from "../../../../src/shared/character-pack/persona-section.ts"
import type { CharacterEdit } from "../../../../src/shared/contract/character-pack.ts"
import { DEFINITION_JSON, PERSONA, PLAUSIBLE_SVG } from "../../../fixture/bundled-character-pack.ts"
import {
  PNG_DATA_URL,
  SVG_DATA_URL,
  setPortrait,
  TSUKUMO,
  useCharacterEditHarness,
} from "../../../fixture/character-edit-harness.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"
import { characterPackName } from "../../../fixture/character.ts"

const { dir, home, writeBundledPack, editInHome } = useCharacterEditHarness("character-edit")

describe("editCharacterPack（立ち絵）", () => {
  it("同梱のパックを直さず、ホームへ写してから書く（人格も一緒に写る）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), setPortrait("proud", PNG_DATA_URL))

    expect(edited?.dir).toBe(join(home(), "tsukumo"))
    expect(edited?.definition?.portraits.proud).toBe("proud.png")
    // 写した先には人格とほかの表情の素材も並んでいる（次の起動で欠けない）。
    expect(edited?.persona).toBe(PERSONA)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(true)
    expect(existsSync(join(home(), "tsukumo", "thinking.svg"))).toBe(true)
    // 同梱側は触っていない。
    expect(readPackAt(bundled).definition?.portraits.proud).toBe("proud.svg")
  })

  it("書いた立ち絵の中身が、そのファイル名で読める", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), setPortrait("default", SVG_DATA_URL))

    expect(edited?.definition?.portraits.default).toBe("default.svg")
    expect(readFileSync(join(home(), "tsukumo", "default.svg"), "utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("形式を変えて差し替えると、参照が外れた古いファイルは残らない", () => {
    const bundled = writeBundledPack("tsukumo")

    editInHome(readPackAt(bundled), setPortrait("default", PNG_DATA_URL))

    expect(existsSync(join(home(), "tsukumo", "default.png"))).toBe(true)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(false)
  })

  it("保存した値は次の起動で読まれる（ホームが同梱に勝つ）", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir(), "cwd")

    editInHome(readPackAt(bundled), setPortrait("proud", PNG_DATA_URL))

    // 起こし直したときと同じ手順で読み直す。
    const packs = listCharacterPacks(cwd, { bundled: join(dir(), "bundled"), home: home() })
    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo"])
    expect(packs[0]?.dir).toBe(join(home(), "tsukumo"))
    expect(packs[0]?.definition?.portraits.proud).toBe("proud.png")
    expect(packs[0]?.persona).toBe(PERSONA)
  })

  it("2回目の編集ではホームの版を土台にする（前の変更を上書きしない）", () => {
    const bundled = writeBundledPack("tsukumo")

    const first = editInHome(readPackAt(bundled), setPortrait("proud", PNG_DATA_URL))
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const second = editInHome(first, setPortrait("default", PNG_DATA_URL))

    expect(second?.definition?.portraits.proud).toBe("proud.png")
    expect(second?.definition?.portraits.default).toBe("default.png")
  })

  it("立ち絵を消すと定義から外れ、ファイルも残らない", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "clearPortrait",
      pack: TSUKUMO,
      expression: "proud",
    })

    expect(edited?.definition?.portraits.proud).toBeUndefined()
    expect(edited?.definition?.portraits.default).toBe("default.svg")
    expect(existsSync(join(home(), "tsukumo", "proud.svg"))).toBe(false)
  })

  it("立ち絵の数が上限に達していたら、新しい名前では受け付けない", () => {
    const bundled = writeBundledPack("tsukumo")
    // まず写させてから、上限まで画像で埋める。
    const edited = editInHome(readPackAt(bundled), setPortrait("default", SVG_DATA_URL))
    expect(edited).toBeDefined()
    // 1つのパックが持てる画像は、表情ごとの立ち絵とミニ立ち絵・背景・顔の3つ。
    for (let index = 0; index < EXPRESSIONS.length + 3; index += 1) {
      writeFileSync(join(home(), "tsukumo", `spare-${String(index)}.png`), "x")
    }

    expect(
      editInHome(readPackAt(join(home(), "tsukumo")), setPortrait("proud", PNG_DATA_URL)),
    ).toBeUndefined()
  })

  it("定義がまだ無いパックにも立ち絵を足せる", () => {
    const empty = join(dir(), "bundled", "bare")
    mkdirSync(empty, { recursive: true })

    const edited = editInHome(readPackAt(empty), setPortrait("default", PNG_DATA_URL, "bare"))

    expect(edited?.definition?.portraits.default).toBe("default.png")
  })
})

describe("editCharacterPack（画面の差し色）", () => {
  it.each([
    { target: "work", color: "#123456", key: "accent" },
    { target: "chat", color: "#f2984a", key: "chatAccent" },
  ] as const)("$target の差し色（$key）を差す", ({ target, color, key }) => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setAccent",
      pack: TSUKUMO,
      target,
      color,
    })

    expect(edited?.definition?.[key]).toBe(color)
  })

  it("雑談の差し色を消すと、仕事の差し色に戻る（chatAccent が undefined になる）", () => {
    const bundled = writeBundledPack("tsukumo")

    const withChatAccent = editInHome(readPackAt(bundled), {
      kind: "setAccent",
      pack: TSUKUMO,
      target: "chat",
      color: "#f2984a",
    })
    expect(withChatAccent).toBeDefined()
    if (withChatAccent === undefined) {
      return
    }
    const cleared = editInHome(withChatAccent, { kind: "clearChatAccent", pack: TSUKUMO })

    expect(cleared?.definition?.chatAccent).toBeUndefined()
  })
})

describe("editCharacterPack（名前と自己紹介文）", () => {
  it("名前と自己紹介文を差し替える（characterPack.setProfile。ほかのキーは残る）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setProfile",
      pack: TSUKUMO,
      name: "新しい表示名",
      tagline: "自己紹介文",
    })

    expect(edited?.definition?.name).toBe("新しい表示名")
    expect(edited?.definition?.tagline).toBe("自己紹介文")
    // characterPack.setPortrait / characterPack.setAccent と同じく、触っていないキーは残る。
    expect(edited?.definition?.portraits.default).toBe("default.svg")

    // 一覧に読み直しても書き変わった定義が出る（サーバは書いたあと `event()` で一覧を読み直す。
    // `applyEdit`）。
    const packs = listCharacterPacks(join(dir(), "cwd"), {
      bundled: join(dir(), "bundled"),
      home: home(),
    })
    expect(packs.find((pack) => pack.name === "tsukumo")?.definition?.name).toBe("新しい表示名")
    expect(packs.find((pack) => pack.name === "tsukumo")?.definition?.tagline).toBe("自己紹介文")
  })

  it("名前を空にすると character.json から name が消え、id（パック名）へ落ちる", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setProfile",
      pack: TSUKUMO,
      name: "",
      tagline: "残る一言",
    })

    expect(edited?.definition?.name).toBeUndefined()
    expect(edited?.definition?.tagline).toBe("残る一言")
  })

  it("ひとことを空にすると消える（前後の空白だけも同じ）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), {
      kind: "setProfile",
      pack: TSUKUMO,
      name: "残る名前",
      tagline: "  ",
    })

    expect(edited?.definition?.name).toBe("残る名前")
    expect(edited?.definition?.tagline).toBeUndefined()
  })
})

describe("editCharacterPack（ペルソナ）", () => {
  const SECTION = `${REMEMBERED_SECTION_HEADING}\n\n- 覚えた一行\n`

  function setPersona(persona: string): CharacterEdit {
    return { kind: "setPersona", pack: TSUKUMO, persona }
  }

  function homePersona(): string {
    return readFileSync(join(home(), "tsukumo", "persona.md"), "utf8")
  }

  it("本文を差し替え、同梱のパックはホームへ写してから書く（同梱は変わらない）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readPackAt(bundled), setPersona("新しい人格"))

    expect(homePersona()).toBe("新しい人格\n")
    expect(readFileSync(join(bundled, "persona.md"), "utf8")).toBe(PERSONA)
    expect(edited?.persona).toBe("新しい人格\n")
  })

  it("覚えたことの節は書く瞬間のファイルのまま残る（読んでから書くまでの間に1行足されても）", () => {
    const bundled = writeBundledPack("tsukumo")
    const pack = readPackAt(bundled)
    // 画面が本文を読んだあと、保存の前に雑談が節へ1行足した状態。
    mkdirSync(join(home(), "tsukumo"), { recursive: true })
    writeFileSync(join(home(), "tsukumo", "character.json"), DEFINITION_JSON)
    writeFileSync(join(home(), "tsukumo", "persona.md"), `${PERSONA}\n\n${SECTION}`)

    editInHome(pack, setPersona("新しい人格"))

    expect(homePersona()).toBe(`新しい人格\n\n${SECTION}`)
  })

  it("persona.md が無いパックでも、本文を書けば作る", () => {
    const bundled = writeBundledPack("tsukumo")
    rmSync(join(bundled, "persona.md"))

    editInHome(readPackAt(bundled), setPersona("作る人格"))

    expect(homePersona()).toBe("作る人格\n")
  })
})

describe("editCharacterPack（受け付けないもの）", () => {
  it("起動先の characters/local のパックは書かない（ホームに書いても次の起動で負けるため）", () => {
    const cwd = join(dir(), "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)

    expect(
      editInHome(readPackAt(localDir), setPortrait("proud", PNG_DATA_URL, "local")),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
  })

  it("使用中でないパックとして起動先の characters/local を指しても書かない", () => {
    const cwd = join(dir(), "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    const current = readPackAt(writeBundledPack("tsukumo"))

    expect(
      editInHome(current, setPortrait("proud", PNG_DATA_URL, "local"), [
        current,
        readPackAt(localDir),
      ]),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
  })

  it("一覧に無いパックの名前は書かない（名前からディレクトリを作らない）", () => {
    const current = readPackAt(writeBundledPack("tsukumo"))

    expect(
      editInHome(current, setPortrait("proud", PNG_DATA_URL, "fictional-missing"), [current]),
    ).toBeUndefined()
    expect(existsSync(join(home(), "fictional-missing"))).toBe(false)
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
  })
})

describe("editCharacterPack（使用中でないパック）", () => {
  it("立ち絵・差し色・背景を変えると、ホームのそのパックの下だけが書き変わる", () => {
    const cwd = join(dir(), "cwd")
    const roots = { bundled: join(dir(), "bundled"), home: home() }
    const current = readPackAt(writeBundledPack("tsukumo"))
    writeBundledPack("fictional-other")
    // 画面が1回ごとに一覧を読み直すのと同じく、編集のたびに一覧を引き直して渡す。
    const edit = (command: CharacterEdit) =>
      editCharacterPack(current, listCharacterPacks(cwd, roots), command, cwd, home())

    edit(setPortrait("proud", PNG_DATA_URL, "fictional-other"))
    edit({
      kind: "setAccent",
      pack: characterPackName("fictional-other"),
      target: "work",
      color: "#123456",
    })
    const edited = edit({
      kind: "setBackground",
      pack: characterPackName("fictional-other"),
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
    expect(readPackAt(current.dir).definition).toEqual(current.definition)
    const bundledOther = readPackAt(join(dir(), "bundled", "fictional-other")).definition
    expect(bundledOther?.portraits.proud).toBe("proud.svg")
    expect(bundledOther?.accent).toBeUndefined()
    expect(bundledOther?.background).toBeUndefined()
  })
})
