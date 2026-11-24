import { mkdirSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  characterChangedEvent,
  isEditableCharacterPack,
  listCharacterPacks,
} from "../../../../src/server/character-pack/adapter/character-pack.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"
import {
  characterInfo,
  characterPackEntry,
  characterPackName,
  shownPortraits,
} from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

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
})

const dir = useTempDir("character-pack")

describe("readCharacterPack", () => {
  it("character.json を読んでパースする", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)

    const pack = readPackAt(dir())

    expect(pack.definition?.name).toBe("架空の精霊")
  })

  it("character.json が無ければ definition が undefined", () => {
    expect(readPackAt(dir()).definition).toBeUndefined()
  })

  it("character.json が壊れていれば definition が undefined", () => {
    writeFileSync(join(dir(), "character.json"), "{壊れた json")

    expect(readPackAt(dir()).definition).toBeUndefined()
  })
})

describe("characterChangedEvent", () => {
  it("portraits の値をファイル名でなく /character/<pack>/<file> の URL にする", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)

    const pack = readPackAt(dir())
    const event = characterChangedEvent(pack, [pack], dir())
    const base = `/character/${encodeURIComponent(basename(dir()))}`
    const version = `?v=${String(pack.revision)}`
    const character = characterInfo({
      pack: characterPackName(basename(dir())),
      expressions: [
        { name: "default", role: "通常", label: "通常" },
        { name: "thinking", role: "考え中", label: "作業中" },
      ],
      ...shownPortraits({
        default: `${base}/default.svg${version}`,
        thinking: `${base}/thinking.svg${version}`,
      }),
      // 定義に mini が無いパックなので、ミニ立ち絵は portraits.default に落ちる。
      mini: `${base}/default.svg${version}`,
    })

    expect(event).toEqual({
      kind: "character-changed",
      ...character,
      packs: [characterPackEntry(basename(dir()), "架空の精霊", { character, inUse: true })],
    })
  })

  it("定義が無くても、立ち絵なしでパック名を名前にして流せる", () => {
    const pack = readPackAt(dir())
    const event = characterChangedEvent(pack, [], dir())

    expect(event).toMatchObject({
      kind: "character-changed",
      name: basename(dir()),
      expressions: [{ name: "default", role: "通常" }],
    })
  })

  describe.each([
    { key: "face", fileName: "face.svg", absent: "mini や portraits から補わない" },
    { key: "diaryFont", fileName: "shodo.woff2", absent: "--font-serif のまま描く" },
  ] as const)("$key（素材の欄）", ({ key, fileName, absent }) => {
    it("あれば素材の URL にする", () => {
      writeFileSync(
        join(dir(), "character.json"),
        JSON.stringify({ portraits: { default: "default.svg" }, [key]: fileName }),
      )

      const pack = readPackAt(dir())
      const event = characterChangedEvent(pack, [], dir())

      expect(event).toMatchObject({
        [key]: `/character/${encodeURIComponent(basename(dir()))}/${fileName}?v=${String(pack.revision)}`,
      })
    })

    it(`無いパックでは undefined のまま（${absent}）`, () => {
      writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)

      const event = characterChangedEvent(readPackAt(dir()), [], dir())

      expect(event).toMatchObject({ [key]: undefined })
    })
  })
})

// 一覧の1件（`CharacterPackEntry`）。使用中以外のパックも姿ごと載る（docs/architecture/character-pack.md「パックの一覧と素材の URL」）。
// 3つの置き場に1つずつ、立ち絵の枚数が違う架空のパックを置く。
describe("characterChangedEvent の一覧（packs）", () => {
  const cwd = (): string => join(dir(), "cwd")
  const roots = (): { readonly bundled: string; readonly home: string } => ({
    bundled: join(dir(), "bundled"),
    home: join(dir(), "home"),
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

  function currentByName(name: string): ReturnType<typeof readPackAt> {
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
      // 起動先の characters/local は画面から変えられない。
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
      // 使用中を押せなくするのは画面。消すと何が起きるかは使用中でも同じ。
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

    expect(
      other?.character.portraits?.default?.startsWith("/character/from-screen/default.png"),
    ).toBe(true)
    expect(
      other?.character.background?.image?.startsWith("/character/from-screen/background.png"),
    ).toBe(true)
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
    const elsewhere = readPackAt(
      writePack(join(dir(), "elsewhere"), "wanderer", { portraits: { default: "w.svg" } }),
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

// この文面を `systemPrompt` のどこへ並べるかは
// ここの担当ではない。ここが見るのは読めたかどうか。
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"

describe("persona.md", () => {
  it("パックの persona.md を全文そのまま読む", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir(), "persona.md"), PERSONA)

    const pack = readPackAt(dir())

    expect(pack.persona).toBe(PERSONA)
  })

  it("persona.md が無いパックでも読める（人格は undefined。append が規約だけになる）", () => {
    writeFileSync(join(dir(), "character.json"), DEFINITION_JSON)

    const pack = readPackAt(dir())

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

  /** 探し先3箇所。ホームは必ず tmp に向ける（本物の `~/.tsukumo` を読まない）。 */
  function roots(): { readonly bundled: string; readonly home: string } {
    return { bundled: join(dir(), "bundled"), home: join(dir(), "home") }
  }

  it("同梱の characters/・ホーム・起動先の characters/local/ を並べる", () => {
    writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)
    writePack(roots().home, "from-screen", DEFINITION_JSON)
    const cwd = join(dir(), "cwd")
    writePack(join(cwd, "characters"), "local", DEFINITION_JSON)

    const packs = listCharacterPacks(cwd, roots())

    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo-spirit", "from-screen", "local"])
  })

  it("tsukumo は名前順・置き場の順より前、一覧の先頭に出る", () => {
    writePack(roots().bundled, "chou", DEFINITION_JSON)
    writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)
    writePack(roots().home, "tsukumo", DEFINITION_JSON)

    const packs = listCharacterPacks(join(dir(), "cwd"), roots())

    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo", "chou", "tsukumo-spirit"])
  })

  it("同名はホームが同梱に勝つ（画面から変えたものが出る）", () => {
    const bundledSpirit = writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)
    const homeSpirit = writePack(roots().home, "tsukumo-spirit", DEFINITION_JSON)

    const packs = listCharacterPacks(join(dir(), "cwd"), roots())

    expect(packs.map((pack) => pack.name)).toEqual(["tsukumo-spirit"])
    expect(packs[0]?.dir).toBe(homeSpirit)
    expect(packs[0]?.dir).not.toBe(bundledSpirit)
  })

  it("同名は起動先がホームにも勝つ", () => {
    writePack(roots().bundled, "local", DEFINITION_JSON)
    writePack(roots().home, "local", DEFINITION_JSON)
    const cwd = join(dir(), "cwd")
    const cwdLocal = writePack(join(cwd, "characters"), "local", DEFINITION_JSON)

    const packs = listCharacterPacks(cwd, roots())

    expect(packs.map((pack) => pack.name)).toEqual(["local"])
    expect(packs[0]?.dir).toBe(cwdLocal)
  })

  it("character.json が無いディレクトリはパックとして数えない", () => {
    writePack(roots().bundled, "not-a-pack")
    writePack(roots().bundled, "tsukumo-spirit", DEFINITION_JSON)

    expect(listCharacterPacks(join(dir(), "cwd"), roots()).map((pack) => pack.name)).toEqual([
      "tsukumo-spirit",
    ])
  })

  it("置き場が無くても落ちない（一覧が空になるだけ）", () => {
    expect(
      listCharacterPacks(join(dir(), "missing"), {
        bundled: join(dir(), "missing"),
        home: join(dir(), "missing"),
      }),
    ).toEqual([])
  })
})

describe("isEditableCharacterPack", () => {
  it("起動先の characters/local と同じ名前のパックは画面から変えられない", () => {
    const cwd = join(dir(), "cwd")
    mkdirSync(join(cwd, "characters", "local"), { recursive: true })
    writeFileSync(join(cwd, "characters", "local", "character.json"), DEFINITION_JSON)

    const local = readPackAt(join(cwd, "characters", "local"))

    expect(isEditableCharacterPack(local, cwd)).toBe(false)
  })

  it("起動先に characters/local が無ければ、local という名前でも変えられる", () => {
    const cwd = join(dir(), "cwd")
    mkdirSync(join(dir(), "home", "local"), { recursive: true })
    writeFileSync(join(dir(), "home", "local", "character.json"), DEFINITION_JSON)

    const fromHome = readPackAt(join(dir(), "home", "local"))

    expect(isEditableCharacterPack(fromHome, cwd)).toBe(true)
  })

  it("同梱のパックは変えられる（ホームに書いた版が勝つ）", () => {
    mkdirSync(join(dir(), "bundled", "tsukumo"), { recursive: true })
    writeFileSync(join(dir(), "bundled", "tsukumo", "character.json"), DEFINITION_JSON)

    const bundled = readPackAt(join(dir(), "bundled", "tsukumo"))

    expect(isEditableCharacterPack(bundled, join(dir(), "cwd"))).toBe(true)
  })
})
