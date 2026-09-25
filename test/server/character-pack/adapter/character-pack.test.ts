import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import { bundledFilePath } from "../../../../src/server/adapter/bundled-path.ts"
import {
  characterChangedEvent,
  isEditableCharacterPack,
  listCharacterPacks,
  readCharacterAsset,
  readCharacterPack,
  readCharacterPackFile,
} from "../../../../src/server/character-pack/adapter/character-pack.ts"
import {
  characterInfo,
  characterPackEntry,
  shownOutfitAccents,
  shownPortraits,
} from "../../../fixture/character.ts"

// フィクスチャは characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  expressions: {
    default: "通常",
    thinking: "作業中",
  },
  portraits: {
    default: "default.svg",
    thinking: "thinking.svg",
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
  it("portraits の値をファイル名でなく /character/<pack>/<file> の URL にする", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const pack = readCharacterPack(dir)
    const event = characterChangedEvent(pack, [pack], dir)
    // パックの名前は経路に入り、取り直しの印は素材の版（更新時刻）だけ。
    const base = `/character/${encodeURIComponent(basename(dir))}`
    const version = `?v=${String(pack.revision)}`
    const character = characterInfo({
      pack: basename(dir),
      expressions: [
        { name: "default", label: "通常" },
        { name: "thinking", label: "作業中" },
      ],
      ...shownPortraits({
        default: `${base}/default.svg${version}`,
        thinking: `${base}/thinking.svg${version}`,
      }),
      // 定義に mini が無いパックなので、ミニ立ち絵は portraits.default に落ちる。
      mini: `${base}/default.svg${version}`,
      outfitAccents: shownOutfitAccents({ default: "#b8c7ff", normal: "#b8c7ff" }),
    })

    expect(event).toEqual({
      kind: "character-changed",
      ...character,
      packs: [characterPackEntry(basename(dir), "架空の精霊", { character, inUse: true })],
    })
  })

  it("定義が無くても、立ち絵なしの形で流せる", () => {
    const pack = readCharacterPack(dir)
    const event = characterChangedEvent(pack, [], dir)

    expect(event).toMatchObject({
      kind: "character-changed",
      name: undefined,
      expressions: [{ name: "default", label: "default" }],
    })
  })

  it("face があれば素材の URL にする（mini と違い default へは畳まない）", () => {
    writeFileSync(
      join(dir, "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" }, face: "face.svg" }),
    )

    const pack = readCharacterPack(dir)
    const event = characterChangedEvent(pack, [], dir)

    expect(event).toMatchObject({
      face: `/character/${encodeURIComponent(basename(dir))}/face.svg?v=${String(pack.revision)}`,
    })
  })

  it("face が無いパックでは undefined のまま（mini や portraits から補わない）", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const event = characterChangedEvent(readCharacterPack(dir), [], dir)

    expect(event).toMatchObject({ face: undefined })
  })

  it("diaryFont があれば素材の URL にする（日記の書体。docs/design.md 7章）", () => {
    writeFileSync(
      join(dir, "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" }, diaryFont: "shodo.woff2" }),
    )

    const pack = readCharacterPack(dir)
    const event = characterChangedEvent(pack, [], dir)

    expect(event).toMatchObject({
      diaryFont: `/character/${encodeURIComponent(basename(dir))}/shodo.woff2?v=${String(pack.revision)}`,
    })
  })

  it("diaryFont が無いパックでは undefined のまま（--font-serif のまま描く）", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const event = characterChangedEvent(readCharacterPack(dir), [], dir)

    expect(event).toMatchObject({ diaryFont: undefined })
  })
})

// 一覧の1件（`CharacterPackEntry`）。**使用中以外のパックも姿ごと載る**（docs/design.md 7.2）。
// 3つの置き場に1つずつ、立ち絵の枚数が違う架空のパックを置く。
describe("characterChangedEvent の一覧（packs）", () => {
  const cwd = (): string => join(dir, "cwd")
  const roots = (): { readonly bundled: string; readonly home: string } => ({
    bundled: join(dir, "bundled"),
    home: join(dir, "home"),
  })

  function writePack(root: string, name: string, definition: object): string {
    const packDir = join(root, name)
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, "character.json"), JSON.stringify(definition))
    return packDir
  }

  function writeThreePacks(): void {
    writePack(roots().bundled, "spirit", {
      name: "架空の精霊",
      portraits: { default: "default.svg", thinking: "thinking.svg" },
    })
    writePack(roots().home, "from-screen", {
      tagline: "架空のひとこと",
      portraits: { default: "default.png" },
      background: { image: "background.png", veil: 0.5 },
    })
    writePack(join(cwd(), "characters"), "local", {
      name: "架空の同居人",
      portraits: { default: "a.svg", proud: "b.svg", sad: "c.svg" },
    })
  }

  function currentByName(name: string): ReturnType<typeof readCharacterPack> {
    const found = listCharacterPacks(cwd(), roots()).find((pack) => pack.name === name)
    if (found === undefined) {
      throw new Error(`テストの前提: ${name} が一覧に無い`)
    }
    return found
  }

  it("全パックについて、表情の枚数・使用中か・変えられるか・消すと何が起きるかを持つ", () => {
    writeThreePacks()
    const packs = listCharacterPacks(cwd(), roots())

    const event = characterChangedEvent(currentByName("spirit"), packs, cwd(), roots())

    expect(
      event.kind === "character-changed"
        ? event.packs.map((entry) => ({
            name: entry.name,
            label: entry.label,
            expressionsWithPortrait: entry.character.expressionsWithPortrait.length,
            inUse: entry.inUse,
            editable: entry.character.editable,
            removal: entry.removal,
          }))
        : undefined,
    ).toEqual([
      {
        name: "spirit",
        label: "架空の精霊",
        expressionsWithPortrait: 2,
        inUse: true,
        editable: true,
        removal: "none",
      },
      {
        name: "from-screen",
        label: "from-screen",
        expressionsWithPortrait: 1,
        inUse: false,
        editable: true,
        removal: "delete",
      },
      // 起動先の characters/local は画面から変えられない（ホームに書いても次の起動で負ける）。
      {
        name: "local",
        label: "架空の同居人",
        expressionsWithPortrait: 3,
        inUse: false,
        editable: false,
        removal: "none",
      },
    ])
  })

  it("同梱を画面で直したホームの版は同梱に戻す口、local に負けるホームの版は口なし、使用中でも口の種類は変わらない", () => {
    writeThreePacks()
    // 同梱の spirit を画面で直した版と、起動先の local に負ける同名の版をホームに置く。
    writePack(roots().home, "spirit", { name: "直した精霊", portraits: { default: "d.svg" } })
    writePack(roots().home, "local", { portraits: { default: "d.svg" } })
    const packs = listCharacterPacks(cwd(), roots())

    const event = characterChangedEvent(currentByName("from-screen"), packs, cwd(), roots())

    expect(
      event.kind === "character-changed"
        ? event.packs.map(({ name, inUse, removal }) => ({ name, inUse, removal }))
        : undefined,
    ).toEqual([
      { name: "spirit", inUse: false, removal: "revert-to-bundled" },
      // 使用中を押せなくするのは画面（inUse を見る）。消すと何が起きるかは使用中でも同じ。
      { name: "from-screen", inUse: true, removal: "delete" },
      { name: "local", inUse: false, removal: "none" },
    ])
  })

  it("使用中以外のパックの立ち絵・背景・ひとことも、そのパックの名前つきの URL で持つ", () => {
    writeThreePacks()
    const packs = listCharacterPacks(cwd(), roots())

    const event = characterChangedEvent(currentByName("spirit"), packs, cwd())
    const other =
      event.kind === "character-changed"
        ? event.packs.find((entry) => entry.name === "from-screen")
        : undefined

    expect(other?.character.portraits?.default).toStartWith("/character/from-screen/default.png")
    expect(other?.character.background?.image).toStartWith("/character/from-screen/background.png")
    expect(other?.character.tagline).toBe("架空のひとこと")
  })

  it("持ち替えると使用中の印も動き、いまの姿はその1件と同じ", () => {
    writeThreePacks()
    const packs = listCharacterPacks(cwd(), roots())

    const event = characterChangedEvent(currentByName("from-screen"), packs, cwd())

    expect(
      event.kind === "character-changed"
        ? event.packs.filter((entry) => entry.inUse).map((entry) => entry.name)
        : undefined,
    ).toEqual(["from-screen"])
    const inUse =
      event.kind === "character-changed" ? event.packs.find((entry) => entry.inUse) : undefined
    expect(event).toMatchObject({ ...inUse?.character })
  })

  it("一覧を読んだあとに持ち替えたパックは、同じ名前の行を置き換える（無ければ末尾に足す）", () => {
    writeThreePacks()
    const packs = listCharacterPacks(cwd(), roots())
    // 一覧に無い場所を直に指したパック（`TSUKUMO_CHARACTER` のとき）。
    const elsewhere = readCharacterPack(
      writePack(join(dir, "elsewhere"), "wanderer", { portraits: { default: "w.svg" } }),
    )

    const event = characterChangedEvent(elsewhere, packs, cwd())

    expect(
      event.kind === "character-changed" ? event.packs.map((entry) => entry.name) : undefined,
    ).toEqual(["spirit", "from-screen", "local", "wanderer"])
  })

  it("一覧のラベルは character.json の name。無ければディレクトリ名", () => {
    writeThreePacks()

    const event = characterChangedEvent(
      currentByName("spirit"),
      listCharacterPacks(cwd(), roots()),
      cwd(),
    )

    expect(
      event.kind === "character-changed"
        ? event.packs.map(({ name, label }) => ({ name, label }))
        : undefined,
    ).toEqual([
      { name: "spirit", label: "架空の精霊" },
      { name: "from-screen", label: "from-screen" },
      { name: "local", label: "架空の同居人" },
    ])
  })
})

// **人格は手で書いた架空の一文だけ**（実物の人格ファイルも会話も使わない。
// docs/coding-standards.md「会話内容の扱い」）。**この文面を `systemPrompt` のどこへ並べるかは
// ここの担当ではない**（`test/server/system-prompt/core/system-prompt.test.ts`）。ここが見るのは読めたかどうか。
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

describe("persona.md", () => {
  it("パックの persona.md を全文そのまま読む", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir, "persona.md"), PERSONA)

    const pack = readCharacterPack(dir)

    expect(pack.persona).toBe(PERSONA)
  })

  it("persona.md が無いパックでも読める（人格は undefined。append が規約だけになる）", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const pack = readCharacterPack(dir)

    expect(pack.persona).toBeUndefined()
  })
})

describe("listCharacterPacks", () => {
  /** `<root>/<name>/character.json` を置く。`definition` を省くとパックにならない。 */
  function writePack(root: string, name: string, definition?: string): string {
    const packDir = join(root, name)
    mkdirSync(packDir, { recursive: true })
    if (definition !== undefined) {
      writeFileSync(join(packDir, "character.json"), definition)
    }
    return packDir
  }

  /** 探し先3箇所。**ホームは必ず tmp に向ける**（本物の `~/.tsukumo` を読まない）。 */
  function roots(): { readonly bundled: string; readonly home: string } {
    return { bundled: join(dir, "bundled"), home: join(dir, "home") }
  }

  it("同梱の characters/・ホーム・起動先の characters/local/ を並べる", () => {
    writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)
    writePack(roots().home, "from-screen", DEFINITION_JSON)
    const cwd = join(dir, "cwd")
    writePack(join(cwd, "characters"), "local", DEFINITION_JSON)

    const packs = listCharacterPacks(cwd, roots())

    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo-spirit", "from-screen", "local"])
  })

  it("tsukumo は名前順・置き場の順より前、一覧の先頭に出る", () => {
    writePack(roots().bundled, "chou", DEFINITION_JSON)
    writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)
    writePack(roots().home, "tsukumo", DEFINITION_JSON)

    const packs = listCharacterPacks(join(dir, "cwd"), roots())

    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo", "chou", "tsukumo-spirit"])
  })

  it("同名はホームが同梱に勝つ（画面から変えたものが出る）", () => {
    const bundledSpirit = writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)
    const homeSpirit = writePack(roots().home, "tsukumo-spirit", DEFINITION_JSON)

    const packs = listCharacterPacks(join(dir, "cwd"), roots())

    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo-spirit"])
    expect(packs[0]?.dir).toBe(homeSpirit)
    expect(packs[0]?.dir).not.toBe(bundledSpirit)
  })

  it("同名は起動先がホームにも勝つ", () => {
    writePack(roots().bundled, "local", DEFINITION_JSON)
    writePack(roots().home, "local", DEFINITION_JSON)
    const cwd = join(dir, "cwd")
    const cwdLocal = writePack(join(cwd, "characters"), "local", DEFINITION_JSON)

    const packs = listCharacterPacks(cwd, roots())

    expect(packs.map((pack) => pack.name)).toEqual(["local"])
    expect(packs[0]?.dir).toBe(cwdLocal)
  })

  it("character.json が無いディレクトリはパックとして数えない", () => {
    writePack(roots().bundled, "not-a-pack")
    writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)

    expect(listCharacterPacks(join(dir, "cwd"), roots()).map((pack) => pack.name)).toEqual([
      "tsukumo-spirit",
    ])
  })

  it("置き場が無くても落ちない（一覧が空になるだけ）", () => {
    expect(
      listCharacterPacks(join(dir, "missing"), {
        bundled: join(dir, "missing"),
        home: join(dir, "missing"),
      }),
    ).toEqual([])
  })
})

describe("isEditableCharacterPack", () => {
  it("起動先の characters/local と同じ名前のパックは画面から変えられない", () => {
    const cwd = join(dir, "cwd")
    mkdirSync(join(cwd, "characters", "local"), { recursive: true })
    writeFileSync(join(cwd, "characters", "local", "character.json"), DEFINITION_JSON)

    const local = readCharacterPack(join(cwd, "characters", "local"))

    expect(isEditableCharacterPack(local, cwd)).toBe(false)
  })

  it("起動先に characters/local が無ければ、local という名前でも変えられる", () => {
    const cwd = join(dir, "cwd")
    mkdirSync(join(dir, "home", "local"), { recursive: true })
    writeFileSync(join(dir, "home", "local", "character.json"), DEFINITION_JSON)

    const fromHome = readCharacterPack(join(dir, "home", "local"))

    expect(isEditableCharacterPack(fromHome, cwd)).toBe(true)
  })

  it("同梱のパックは変えられる（ホームに書いた版が勝つ）", () => {
    mkdirSync(join(dir, "bundled", "tsukumo"), { recursive: true })
    writeFileSync(join(dir, "bundled", "tsukumo", "character.json"), DEFINITION_JSON)

    const bundled = readCharacterPack(join(dir, "bundled", "tsukumo"))

    expect(isEditableCharacterPack(bundled, join(dir, "cwd"))).toBe(true)
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

  it("character.json の mini（ミニ立ち絵）も同じ経路で配れる", () => {
    writeFileSync(
      join(dir, "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" }, mini: "mini.svg" }),
    )
    writeFileSync(join(dir, "mini.svg"), PLAUSIBLE_SVG)

    const file = readCharacterPackFile(readCharacterPack(dir), "mini.svg")

    expect(file?.content.toString("utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("character.json の face（顔）も同じ経路で配れる", () => {
    writeFileSync(
      join(dir, "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" }, face: "face.svg" }),
    )
    writeFileSync(join(dir, "face.svg"), PLAUSIBLE_SVG)

    const file = readCharacterPackFile(readCharacterPack(dir), "face.svg")

    expect(file?.content.toString("utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("character.json の diaryFont（日記の書体）も同じ経路で配れ、拡張子に合う Content-Type になる", () => {
    writeFileSync(
      join(dir, "character.json"),
      JSON.stringify({ portraits: { default: "default.svg" }, diaryFont: "shodo.woff2" }),
    )
    // 中身は見ないので、書体ファイルの実物は使わない（架空のバイト列で足りる）。
    writeFileSync(join(dir, "shodo.woff2"), "not a real font, just bytes")

    const file = readCharacterPackFile(readCharacterPack(dir), "shodo.woff2")

    expect(file?.contentType).toBe("font/woff2")
    expect(file?.content.toString("utf8")).toBe("not a real font, just bytes")
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

describe("readCharacterAsset", () => {
  /** 使用中（current）と、使用中以外（other）の2つのパックを置く。 */
  function writeTwoPacks(): {
    readonly current: ReturnType<typeof readCharacterPack>
    readonly other: ReturnType<typeof readCharacterPack>
  } {
    const currentDir = join(dir, "current")
    const otherDir = join(dir, "other")
    mkdirSync(currentDir)
    mkdirSync(otherDir)
    writeFileSync(join(currentDir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(currentDir, "default.svg"), PLAUSIBLE_SVG)
    writeFileSync(
      join(otherDir, "character.json"),
      JSON.stringify({ portraits: { default: "other.svg" } }),
    )
    writeFileSync(join(otherDir, "other.svg"), PLAUSIBLE_SVG)
    return { current: readCharacterPack(currentDir), other: readCharacterPack(otherDir) }
  }

  it("使用中以外のパックの素材も、一覧にある名前なら読める", () => {
    const { current, other } = writeTwoPacks()

    const file = readCharacterAsset(current, [current, other], {
      pack: "other",
      fileName: "other.svg",
    })

    expect(file?.content.toString("utf8")).toBe(PLAUSIBLE_SVG)
  })

  it("別のパックの定義にしか無いファイル名は undefined（allowlist はパックごと）", () => {
    const { current, other } = writeTwoPacks()

    expect(
      readCharacterAsset(current, [current, other], { pack: "other", fileName: "default.svg" }),
    ).toBeUndefined()
  })

  it("一覧に無いパック名・`..` は undefined（名前をパスに使わない）", () => {
    const { current, other } = writeTwoPacks()

    expect(
      readCharacterAsset(current, [current, other], { pack: "missing", fileName: "other.svg" }),
    ).toBeUndefined()
    expect(
      readCharacterAsset(current, [current, other], { pack: "..", fileName: "other.svg" }),
    ).toBeUndefined()
  })
})

// 同梱パック chou は設定画から切り出した実物の素材を使うので、フィクスチャでなく
// リポジトリ上の実ファイルを読んで definition の読み取りとポートレートの存在を確かめる。
describe("同梱パック chou（characters/chou/）", () => {
  it("character.json が読め、portraits と face に挙げたファイルが実在する", () => {
    const chouDir = bundledFilePath("characters", "chou")
    const pack = readCharacterPack(chouDir)

    expect(pack.definition?.name).toBe("帳")
    expect(pack.definition?.portraits.default).toBe("default.png")
    expect(pack.definition?.face).toBe("face.png")

    const fileNames = [...Object.values(pack.definition?.portraits ?? {}), pack.definition?.face]
    for (const fileName of fileNames) {
      if (fileName === undefined) {
        continue
      }
      expect(existsSync(join(chouDir, fileName))).toBe(true)
    }
  })

  it("visit（客として訪ねてくるときの節）が読め、peek の絵が実在する", () => {
    const chouDir = bundledFilePath("characters", "chou")
    const pack = readCharacterPack(chouDir)

    expect(pack.definition?.visit?.peek).toBe("peek.png")
    expect(pack.definition?.visit?.farewell.length).toBeGreaterThan(0)
    expect(pack.definition?.visit?.scripts.length).toBeGreaterThan(0)

    const peek = pack.definition?.visit?.peek
    expect(peek).toBeDefined()
    if (peek !== undefined) {
      expect(existsSync(join(chouDir, peek))).toBe(true)
    }
  })
})
