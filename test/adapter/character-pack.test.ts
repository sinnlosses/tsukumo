import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import {
  buildSystemPromptAppend,
  characterChangedEvent,
  isEditableCharacterPack,
  listCharacterPacks,
  readCharacterPack,
  readCharacterPackFile,
  toCharacterPackChoices,
} from "../../src/adapter/character-pack.ts"

// フィクスチャは characters/tsukumo-spirit/character.json と同じ形の、手で書いた架空の定義。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  speechMarker: "精霊: ",
  expressions: {
    default: "通常",
    working: "作業中",
  },
  portraits: {
    default: "default.svg",
    working: "working.svg",
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
  it("portraits の値をファイル名でなく /character/<file> の URL にする", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const pack = readCharacterPack(dir)
    const event = characterChangedEvent(pack, [{ name: basename(dir), label: "架空の精霊" }], true)
    // 取り直しの印はパックの名前と素材の版（更新時刻）を混ぜたもの。
    const cacheKey = encodeURIComponent(`${basename(dir)}@${String(pack.revision)}`)

    expect(event).toEqual({
      kind: "character-changed",
      pack: basename(dir),
      name: "架空の精霊",
      accent: undefined,
      speechMarker: "精霊: ",
      workingSpeech: "作業中",
      editable: true,
      expressions: [
        { name: "default", label: "通常" },
        { name: "working", label: "作業中" },
      ],
      packs: [{ name: basename(dir), label: "架空の精霊" }],
      portraits: {
        default: `/character/default.svg?v=${cacheKey}`,
        working: `/character/working.svg?v=${cacheKey}`,
        proud: undefined,
        flustered: undefined,
      },
      outfitAccents: {
        default: "#b8c7ff",
        light: undefined,
        normal: "#b8c7ff",
        heavy: undefined,
      },
    })
  })

  it("定義が無くても、立ち絵なしの形で流せる", () => {
    const event = characterChangedEvent(readCharacterPack(dir), [], true)

    expect(event).toMatchObject({
      kind: "character-changed",
      name: undefined,
      expressions: [{ name: "default", label: "default" }],
      packs: [],
    })
  })
})

// **人格は手で書いた架空の一文だけ**（実物の人格ファイルも会話も使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const PERSONA = "# 架空の精霊\n\n語尾に「なのじゃ」と付ける。"
const SPEECH_CADENCE = "（セリフの間合い。テスト用の短い文）"
const REPORT_NOTATION = "（レポートの記法。テスト用の短い文）"
const RULES = [SPEECH_CADENCE, REPORT_NOTATION]

describe("persona.md", () => {
  it("パックの persona.md を読み、人格 → tsukumo 側の規約の順につなぐ", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(dir, "persona.md"), PERSONA)

    const pack = readCharacterPack(dir)

    expect(pack.persona).toBe(PERSONA)
    expect(buildSystemPromptAppend(pack, RULES)).toBe(
      `${PERSONA}\n\n${SPEECH_CADENCE}\n\n${REPORT_NOTATION}`,
    )
  })

  it("persona.md が無いパックでも起動する（append が tsukumo 側の規約だけになる）", () => {
    writeFileSync(join(dir, "character.json"), DEFINITION_JSON)

    const pack = readCharacterPack(dir)

    expect(pack.persona).toBeUndefined()
    expect(buildSystemPromptAppend(pack, RULES)).toBe(`${SPEECH_CADENCE}\n\n${REPORT_NOTATION}`)
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

  it("選択肢のラベルは character.json の name。無ければディレクトリ名", () => {
    writePack(roots().bundled, "named", DEFINITION_JSON)
    writePack(roots().bundled, "unnamed", JSON.stringify({ portraits: {} }))

    expect(toCharacterPackChoices(listCharacterPacks(join(dir, "cwd"), roots()))).toEqual([
      { name: "named", label: "架空の精霊" },
      { name: "unnamed", label: "unnamed" },
    ])
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
