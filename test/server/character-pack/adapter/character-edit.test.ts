import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { omit } from "remeda"
import { describe, expect, it } from "vitest"

import {
  createCharacterPack,
  editCharacterPack,
} from "../../../../src/server/character-pack/adapter/character-edit.ts"
import {
  listCharacterPacks,
  readCharacterPack,
} from "../../../../src/server/character-pack/adapter/character-pack.ts"
import type { CharacterDefinition } from "../../../../src/shared/character-pack/character-definition.ts"
import { EXPRESSIONS } from "../../../../src/shared/character-pack/expression.ts"
import { REMEMBERED_SECTION_HEADING } from "../../../../src/shared/character-pack/persona-section.ts"
import type {
  CharacterCreate,
  CharacterEdit,
} from "../../../../src/shared/contract/character-pack.ts"
import {
  DEFINITION_JSON,
  PERSONA,
  PLAUSIBLE_SVG,
  writeBundledPackUnder,
} from "../../../fixture/bundled-character-pack.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const TSUKUMO = characterPackName("tsukumo")

/** 差し替えに使う架空の PNG（中身は見ないので数バイトでよい）。 */
const PNG_DATA_URL = "data:image/png;base64,AAECAwQ="
const SVG_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(PLAUSIBLE_SVG).toString("base64")}`
/** 背景の差し替えに使う架空の WebP（中身は見ないので数バイトでよい）。 */
const WEBP_DATA_URL = "data:image/webp;base64,AAECAwQ="

const dir = useTempDir("character-edit")

/** 書き込み先の親（本物の `~/.tsukumo/characters` の代わり）。 */
function home(): string {
  return join(dir(), "home")
}

/** 同梱のパックを1つ置く（定義・人格・立ち絵3枚）。 */
function writeBundledPack(name: string): string {
  return writeBundledPackUnder(join(dir(), "bundled"), name)
}

/**
 * 立ち絵を全表情そろえ、ミニ立ち絵も持つパックを置く（実際に使われているパックと同じ形）。
 * 背景はまだ無いので、ここに背景を1枚足せることが画像の数の上限の下限になる。
 */
function writeFullPack(name: string): string {
  const packDir = join(dir(), "bundled", name)
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

function editInHome(
  pack: Parameters<typeof editCharacterPack>[0],
  command: CharacterEdit,
  packs: Parameters<typeof editCharacterPack>[1] = [],
): ReturnType<typeof editCharacterPack> {
  return editCharacterPack(pack, packs, command, join(dir(), "cwd"), home())
}

function setPortrait(
  expression: "default" | "proud",
  image: string,
  pack = "tsukumo",
): CharacterEdit {
  return { kind: "setPortrait", pack: characterPackName(pack), expression, image }
}

/**
 * 新しいパックを作るコマンド（必須の1枚・仕事と雑談の差し色は境界で required なので、ここでも
 * 必ず入る）。名前は既定で空（=「id をそのまま表示名に使う」を試すテストが多いため）で、
 * 表示名を試すテストだけ `overrides` で足す。
 */
function createCharacter(id: string, overrides: Partial<CharacterCreate> = {}): CharacterCreate {
  return {
    id: characterPackName(id),
    name: "",
    portraits: { default: SVG_DATA_URL },
    accent: "#b8c7ff",
    chatAccent: "#eaa77a",
    persona: "",
    ...overrides,
  }
}

describe("editCharacterPack（立ち絵）", () => {
  it("同梱のパックを直さず、ホームへ写してから書く（人格も一緒に写る）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readCharacterPack(bundled), setPortrait("proud", PNG_DATA_URL))

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

    const edited = editInHome(readCharacterPack(bundled), setPortrait("default", SVG_DATA_URL))

    expect(edited?.definition?.portraits.default).toBe("default.svg")
    expect(readFileSync(join(home(), "tsukumo", "default.svg"), "utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("形式を変えて差し替えると、参照が外れた古いファイルは残らない", () => {
    const bundled = writeBundledPack("tsukumo")

    editInHome(readCharacterPack(bundled), setPortrait("default", PNG_DATA_URL))

    expect(existsSync(join(home(), "tsukumo", "default.png"))).toBe(true)
    expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(false)
  })

  it("保存した値は次の起動で読まれる（ホームが同梱に勝つ）", () => {
    const bundled = writeBundledPack("tsukumo")
    const cwd = join(dir(), "cwd")

    editInHome(readCharacterPack(bundled), setPortrait("proud", PNG_DATA_URL))

    // 起こし直したときと同じ手順で読み直す。
    const packs = listCharacterPacks(cwd, { bundled: join(dir(), "bundled"), home: home() })
    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo"])
    expect(packs[0]?.dir).toBe(join(home(), "tsukumo"))
    expect(packs[0]?.definition?.portraits.proud).toBe("proud.png")
    expect(packs[0]?.persona).toBe(PERSONA)
  })

  it("2回目の編集ではホームの版を土台にする（前の変更を上書きしない）", () => {
    const bundled = writeBundledPack("tsukumo")

    const first = editInHome(readCharacterPack(bundled), setPortrait("proud", PNG_DATA_URL))
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

    const edited = editInHome(readCharacterPack(bundled), {
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
    const edited = editInHome(readCharacterPack(bundled), setPortrait("default", SVG_DATA_URL))
    expect(edited).toBeDefined()
    // 1つのパックが持てる画像は、表情ごとの立ち絵とミニ立ち絵・背景・顔の3つ。
    for (let index = 0; index < EXPRESSIONS.length + 3; index += 1) {
      writeFileSync(join(home(), "tsukumo", `spare-${String(index)}.png`), "x")
    }

    expect(
      editInHome(readCharacterPack(join(home(), "tsukumo")), setPortrait("proud", PNG_DATA_URL)),
    ).toBeUndefined()
  })

  it("定義がまだ無いパックにも立ち絵を足せる", () => {
    const empty = join(dir(), "bundled", "bare")
    mkdirSync(empty, { recursive: true })

    const edited = editInHome(
      readCharacterPack(empty),
      setPortrait("default", PNG_DATA_URL, "bare"),
    )

    expect(edited?.definition?.portraits.default).toBe("default.png")
  })
})

describe("editCharacterPack（画面の差し色）", () => {
  it.each([
    { target: "work", color: "#123456", key: "accent" },
    { target: "chat", color: "#f2984a", key: "chatAccent" },
  ] as const)("$target の差し色（$key）を差す", ({ target, color, key }) => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readCharacterPack(bundled), {
      kind: "setAccent",
      pack: TSUKUMO,
      target,
      color,
    })

    expect(edited?.definition?.[key]).toBe(color)
  })

  it("雑談の差し色を消すと、仕事の差し色に戻る（chatAccent が undefined になる）", () => {
    const bundled = writeBundledPack("tsukumo")

    const withChatAccent = editInHome(readCharacterPack(bundled), {
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

    const edited = editInHome(readCharacterPack(bundled), {
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

    const edited = editInHome(readCharacterPack(bundled), {
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

    const edited = editInHome(readCharacterPack(bundled), {
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

    const edited = editInHome(readCharacterPack(bundled), setPersona("新しい人格"))

    expect(homePersona()).toBe("新しい人格\n")
    expect(readFileSync(join(bundled, "persona.md"), "utf8")).toBe(PERSONA)
    expect(edited?.persona).toBe("新しい人格\n")
  })

  it("覚えたことの節は書く瞬間のファイルのまま残る（読んでから書くまでの間に1行足されても）", () => {
    const bundled = writeBundledPack("tsukumo")
    const pack = readCharacterPack(bundled)
    // 画面が本文を読んだあと、保存の前に雑談が節へ1行足した状態。
    mkdirSync(join(home(), "tsukumo"), { recursive: true })
    writeFileSync(join(home(), "tsukumo", "character.json"), DEFINITION_JSON)
    writeFileSync(join(home(), "tsukumo", "persona.md"), `${PERSONA}\n\n${SECTION}`)

    editInHome(pack, setPersona("新しい人格"))

    expect(homePersona()).toBe(`新しい人格\n\n${SECTION}`)
  })

  it("節が無いファイルには本文だけを書く", () => {
    const bundled = writeBundledPack("tsukumo")

    editInHome(readCharacterPack(bundled), setPersona("本文だけ"))

    expect(homePersona()).toBe("本文だけ\n")
  })

  it("persona.md が無いパックでも、本文を書けば作る", () => {
    const bundled = writeBundledPack("tsukumo")
    rmSync(join(bundled, "persona.md"))

    editInHome(readCharacterPack(bundled), setPersona("作る人格"))

    expect(homePersona()).toBe("作る人格\n")
  })
})

describe("editCharacterPack（背景）", () => {
  it("背景を差すと、覆いの濃さは書かなくても読むときに既定へ落ちる（画面からは変えない）", () => {
    const bundled = writeBundledPack("tsukumo")

    const edited = editInHome(readCharacterPack(bundled), {
      kind: "setBackground",
      pack: TSUKUMO,
      image: PNG_DATA_URL,
    })

    expect(edited?.definition?.background?.veil).toBe(0.75)
  })

  it("立ち絵を全表情そろえミニ立ち絵も持つパックでも、背景を差せる", () => {
    const bundled = writeFullPack("tsukumo")

    const edited = editInHome(readCharacterPack(bundled), {
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
      imageOf: (definition: CharacterDefinition | undefined) => definition?.background?.image,
    },
    {
      name: "顔",
      key: "face" as const,
      set: (image: string): CharacterEdit => ({ kind: "setFace", pack: TSUKUMO, image }),
      clear: { kind: "clearFace", pack: TSUKUMO } satisfies CharacterEdit,
      oldFile: "face.svg",
      newFile: "face.png",
      imageOf: (definition: CharacterDefinition | undefined) => definition?.face,
    },
    {
      name: "ミニ立ち絵",
      key: "mini" as const,
      set: (image: string): CharacterEdit => ({ kind: "setMini", pack: TSUKUMO, image }),
      clear: { kind: "clearMini", pack: TSUKUMO } satisfies CharacterEdit,
      oldFile: "mini.svg",
      newFile: "mini.png",
      imageOf: (definition: CharacterDefinition | undefined) => definition?.mini,
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
      original: ReturnType<typeof readCharacterPack>,
    ): void {
      const withoutChanged = (definition: CharacterDefinition | undefined) =>
        definition === undefined ? undefined : omit(definition, [row.key])
      expect(edited?.definition).toBeDefined()
      expect(withoutChanged(edited?.definition)).toEqual(withoutChanged(original.definition))
      expect(existsSync(join(home(), "tsukumo", "default.svg"))).toBe(true)
    }

    it("差すと、形式から組み立てた名前で書かれ、定義がそれを指す", () => {
      const bundled = writeBundledPack("tsukumo")

      const edited = editInHome(readCharacterPack(bundled), row.set(PNG_DATA_URL))

      expect(row.imageOf(edited?.definition)).toBe(row.newFile)
      expect(existsSync(join(home(), "tsukumo", row.newFile))).toBe(true)
      expect(row.imageOf(readCharacterPack(bundled).definition)).toBeUndefined()
    })

    it("形式を変えて差し替えると、参照が外れた古いファイルは残らず、ほかの欄は落ちない", () => {
      const original = readCharacterPack(writeRichPack())

      const edited = editInHome(original, row.set(PNG_DATA_URL))

      expect(row.imageOf(edited?.definition)).toBe(row.newFile)
      expect(existsSync(join(home(), "tsukumo", row.newFile))).toBe(true)
      expect(existsSync(join(home(), "tsukumo", row.oldFile))).toBe(false)
      expectOtherFieldsKept(edited, original)
    })

    it("消すと定義から外れ、ファイルも残らず、ほかの欄は落ちない", () => {
      const original = readCharacterPack(writeRichPack())

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

    const edited = editInHome(readCharacterPack(bundled), {
      kind: "setMini",
      pack: TSUKUMO,
      image: WEBP_DATA_URL,
    })

    expect(edited).toBeUndefined()
    expect(existsSync(join(home(), "tsukumo", "mini.webp"))).toBe(false)
  })
})

describe("editCharacterPack（受け付けないもの）", () => {
  it("起動先の characters/local のパックは書かない（ホームに書いても次の起動で負けるため）", () => {
    const cwd = join(dir(), "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)

    expect(
      editInHome(readCharacterPack(localDir), setPortrait("proud", PNG_DATA_URL, "local")),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
  })

  it("使用中でないパックとして起動先の characters/local を指しても書かない", () => {
    const cwd = join(dir(), "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    const current = readCharacterPack(writeBundledPack("tsukumo"))

    expect(
      editInHome(current, setPortrait("proud", PNG_DATA_URL, "local"), [
        current,
        readCharacterPack(localDir),
      ]),
    ).toBeUndefined()
    expect(existsSync(join(home(), "local"))).toBe(false)
    expect(existsSync(join(home(), "tsukumo"))).toBe(false)
  })

  it("一覧に無いパックの名前は書かない（名前からディレクトリを作らない）", () => {
    const current = readCharacterPack(writeBundledPack("tsukumo"))

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
    const current = readCharacterPack(writeBundledPack("tsukumo"))
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
    expect(readCharacterPack(current.dir).definition).toEqual(current.definition)
    const bundledOther = readCharacterPack(join(dir(), "bundled", "fictional-other")).definition
    expect(bundledOther?.portraits.proud).toBe("proud.svg")
    expect(bundledOther?.accent).toBeUndefined()
    expect(bundledOther?.background).toBeUndefined()
  })
})

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

  it("id とは別の表示名を指定すると character.json に書かれる", () => {
    const created = createCharacterPack(
      createCharacter("fictional-2", { name: "架空の2号" }),
      [],
      home(),
    )

    expect(created?.dir).toBe(join(home(), "fictional-2"))
    expect(created?.definition?.name).toBe("架空の2号")
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
    expect(readCharacterPack(join(dir(), "bundled", "tsukumo")).definition?.portraits.default).toBe(
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
