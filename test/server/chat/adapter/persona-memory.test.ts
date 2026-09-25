import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { readCharacterPack } from "../../../../src/server/character-pack/adapter/character-pack.ts"
import {
  createPersonaMemory,
  forgetRememberedLineFromScreen,
  MAX_REMEMBERED_LINES,
  readRememberedLines,
  REMEMBERED_SECTION_HEADING,
} from "../../../../src/server/chat/adapter/persona-memory.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../../../../src/shared/persona-memory.ts"

// フィクスチャは手で書いた架空のパックと架空の1行だけ（実物の会話・人格は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const DEFINITION_JSON = JSON.stringify({
  name: "架空の精霊",
  license: "テスト用に手で書いたもの",
  portraits: { default: "default.svg" },
})
const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'

/** 同梱のパックが持っている人格（見出しと表を含む形）。 */
const PERSONA = `# 架空の精霊

語尾に「なのじゃ」と付ける。

## 好きなもの

| もの | 度合い |
| ---- | ------ |
| 星   | とても |
`

/** 人が手で書いた箇条書きを持つ人格（`## 覚えたこと` の外にある `- ` の行）。 */
const PERSONA_WITH_BULLET = `# 架空の精霊

## 好きなもの

- 星を眺めること
`

/** 書き足す1行（キャラクター自身の設定。手で書いた架空のもの）。 */
const LINE = "苦いお茶より甘いお茶が好き"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-persona-memory-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 書き込み先の親（本物の `~/.tsukumo/characters` の代わり）。 */
function home(): string {
  return join(dir, "home")
}

/** 同梱のパックを1つ置く（定義・人格・立ち絵1枚）。 */
function writeBundledPack(name: string, persona: string = PERSONA): string {
  const packDir = join(dir, "bundled", name)
  mkdirSync(packDir, { recursive: true })
  writeFileSync(join(packDir, "character.json"), DEFINITION_JSON)
  writeFileSync(join(packDir, "persona.md"), persona)
  writeFileSync(join(packDir, "default.svg"), PLAUSIBLE_SVG)
  return packDir
}

/** 書き込み先（ホーム）の `persona.md`。まだ無ければ undefined。 */
function homePersona(name: string): string | undefined {
  const path = join(home(), name, "persona.md")
  return existsSync(path) ? readFileSync(path, "utf8") : undefined
}

/** 節の中の箇条書きの行（書き足した順のまま）。 */
function rememberedLines(persona: string): readonly string[] {
  const at = persona.indexOf(REMEMBERED_SECTION_HEADING)
  return persona
    .slice(at)
    .split("\n")
    .filter((line) => line.startsWith("- "))
}

/** 節より前の部分（節が無ければ全文）。 */
function beforeSection(persona: string): string {
  const at = persona.indexOf(REMEMBERED_SECTION_HEADING)
  return at < 0 ? persona : persona.slice(0, at)
}

describe("createPersonaMemory", () => {
  it("末尾に `## 覚えたこと` の節を作って1行足す（書き先はホームのパック）", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))

    createPersonaMemory(pack, dir, home()).remember(LINE)

    const written = homePersona("架空")
    expect(written).toBeDefined()
    expect(rememberedLines(written ?? "")).toEqual([`- ${LINE}`])
    // 同梱のパックは書き換わらない（書くのはホームだけ。docs/design.md 7.1）。
    expect(readFileSync(join(pack.dir, "persona.md"), "utf8")).toBe(PERSONA)
  })

  it("節より前のバイト列は、節を作るときも足すときも変わらない", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))
    const memory = createPersonaMemory(pack, dir, home())

    memory.remember(LINE)
    const first = homePersona("架空") ?? ""
    // 節を作る回は、元の人格がそのまま先頭に残る（足すのは見出しの前の改行だけ）。
    expect(first.startsWith(PERSONA)).toBe(true)
    expect(beforeSection(first)).toBe(`${PERSONA}\n`)

    memory.finishTurn()
    memory.remember("星を見るのが好き")

    const second = homePersona("架空") ?? ""
    expect(Buffer.from(beforeSection(second), "utf8")).toEqual(
      Buffer.from(beforeSection(first), "utf8"),
    )
    expect(rememberedLines(second)).toEqual([`- ${LINE}`, "- 星を見るのが好き"])
  })

  it("書き足したあとの persona.md はそのまま読み直せる（readCharacterPack が壊れない）", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))

    createPersonaMemory(pack, dir, home()).remember(LINE)

    const reread = readCharacterPack(join(home(), "架空"))
    expect(reread.definition?.name).toBe("架空の精霊")
    expect(reread.persona).toContain("語尾に「なのじゃ」と付ける。")
    expect(reread.persona).toContain(`- ${LINE}`)
  })

  it("人格が無いパックでも、節だけの persona.md を作って書ける", () => {
    const packDir = join(dir, "bundled", "人格なし")
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, "character.json"), DEFINITION_JSON)

    createPersonaMemory(readCharacterPack(packDir), dir, home()).remember(LINE)

    expect(homePersona("人格なし")).toBe(`${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`)
  })
})

describe("上限: 1ターンに1行", () => {
  it("同じターンの2回目以降は書かず、ターンが終われば次の1行を受け付ける", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.remember("同じターンの2行目")
    memory.remember("同じターンの3行目")

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual([`- ${LINE}`])

    memory.finishTurn()
    memory.remember("次のターンの1行目")

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual([`- ${LINE}`, "- 次のターンの1行目"])
  })

  it("受け付けられなかった行はターンの1行を使わない（長すぎた次にもう一度書ける）", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember("あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1))
    memory.remember(LINE)

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual([`- ${LINE}`])
  })
})

describe("上限: 1行の長さ", () => {
  it("120文字ちょうどは書き、超えた行と改行を含む行は書かない", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))

    const tooLong = createPersonaMemory(pack, dir, home())
    tooLong.remember("あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1))
    expect(homePersona("架空")).toBeUndefined()

    const multiline = createPersonaMemory(pack, dir, home())
    multiline.remember(`${LINE}\n## 好きなもの`)
    expect(homePersona("架空")).toBeUndefined()

    const empty = createPersonaMemory(pack, dir, home())
    empty.remember("   ")
    expect(homePersona("架空")).toBeUndefined()

    const justFits = createPersonaMemory(pack, dir, home())
    justFits.remember("あ".repeat(MAX_REMEMBERED_LINE_LENGTH))
    expect(rememberedLines(homePersona("架空") ?? "")).toEqual([
      `- ${"あ".repeat(MAX_REMEMBERED_LINE_LENGTH)}`,
    ])
  })
})

describe("上限: 節が持てる行数", () => {
  it("20行を超えるといちばん古い行が落ちる（節より前は変わらない）", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    for (let index = 1; index <= MAX_REMEMBERED_LINES + 1; index += 1) {
      memory.remember(`覚えたこと${index}`)
      memory.finishTurn()
    }

    const written = homePersona("架空") ?? ""
    const lines = rememberedLines(written)
    expect(lines).toHaveLength(MAX_REMEMBERED_LINES)
    expect(lines[0]).toBe("- 覚えたこと2")
    expect(lines.at(-1)).toBe(`- 覚えたこと${MAX_REMEMBERED_LINES + 1}`)
    expect(beforeSection(written)).toBe(`${PERSONA}\n`)
  })
})

describe("forget", () => {
  it("完全一致した1行だけを消す（節より前と、残りの行は変わらない）", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")
    memory.finishTurn()
    const before = homePersona("架空") ?? ""

    memory.forget(LINE)

    const after = homePersona("架空") ?? ""
    expect(rememberedLines(after)).toEqual(["- 星を見るのが好き"])
    expect(Buffer.from(beforeSection(after), "utf8")).toEqual(
      Buffer.from(beforeSection(before), "utf8"),
    )
  })

  it("`- ` の印と前後の空白は吸収して指せる", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")
    memory.finishTurn()
    memory.forget(`  - ${LINE}  `)

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual(["- 星を見るのが好き"])
  })

  it("一致する行が無ければ何も変えない（ホームへ写しも作らない）", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))

    createPersonaMemory(pack, dir, home()).forget("覚えていないこと")

    expect(homePersona("架空")).toBeUndefined()
    expect(readFileSync(join(pack.dir, "persona.md"), "utf8")).toBe(PERSONA)
  })

  it("言い換え・前方一致では消せない（完全一致だけ）", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.forget(LINE.slice(0, 5))

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual([`- ${LINE}`])
  })

  it("人が書いた節の箇条書きは消せない（節より前は触らない）", () => {
    const pack = readCharacterPack(writeBundledPack("架空", PERSONA_WITH_BULLET))
    const memory = createPersonaMemory(pack, dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.forget("星を眺めること")

    const written = homePersona("架空") ?? ""
    expect(rememberedLines(written)).toEqual([`- ${LINE}`])
    expect(beforeSection(written)).toBe(`${PERSONA_WITH_BULLET}\n`)
    expect(readFileSync(join(pack.dir, "persona.md"), "utf8")).toBe(PERSONA_WITH_BULLET)
  })

  it("同じ文面が2行あるときは、いちばん古い1つだけを消す", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")
    memory.finishTurn()
    memory.remember(LINE)
    memory.finishTurn()
    memory.forget(LINE)

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual(["- 星を見るのが好き", `- ${LINE}`])
  })

  it("最後の1行を消すと見出しごと消え、節より前は1バイトも変わらない", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))
    const memory = createPersonaMemory(pack, dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.forget(LINE)

    const written = homePersona("架空") ?? ""
    expect(written).not.toContain(REMEMBERED_SECTION_HEADING)
    // 節を作るときに入れた見出しの前の改行だけが残る（節より前を足しも引きもしないため）。
    expect(written).toBe(`${PERSONA}\n`)
  })
})

describe("上限: 1ターンに1行消す", () => {
  it("同じターンの2回目以降は消さず、ターンが終われば次の1行を消せる", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    for (const line of ["覚えたこと1", "覚えたこと2", "覚えたこと3"]) {
      memory.remember(line)
      memory.finishTurn()
    }

    memory.forget("覚えたこと1")
    memory.forget("覚えたこと2")

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual(["- 覚えたこと2", "- 覚えたこと3"])

    memory.finishTurn()
    memory.forget("覚えたこと2")

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual(["- 覚えたこと3"])
  })

  it("一致しなかった回はターンの1行を使わない", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.finishTurn()
    memory.forget("覚えていないこと")
    memory.forget(LINE)

    expect(homePersona("架空")).toBe(`${PERSONA}\n`)
  })

  it("`remember` と `forget` は別に数える（同じターンで覚え直せる）", () => {
    const memory = createPersonaMemory(readCharacterPack(writeBundledPack("架空")), dir, home())

    memory.remember(LINE)
    memory.finishTurn()

    memory.forget(LINE)
    memory.remember("苦いお茶のほうが好き")

    expect(rememberedLines(homePersona("架空") ?? "")).toEqual(["- 苦いお茶のほうが好き"])
  })
})

describe("書かないパック", () => {
  it("起動先の characters/local と同じ名前のパックには書かない", () => {
    const cwd = join(dir, "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    writeFileSync(join(localDir, "persona.md"), PERSONA)

    createPersonaMemory(readCharacterPack(localDir), cwd, home()).remember(LINE)

    expect(homePersona("local")).toBeUndefined()
    expect(readFileSync(join(localDir, "persona.md"), "utf8")).toBe(PERSONA)
  })

  it("起動先の characters/local と同じ名前のパックからは消しもしない", () => {
    const cwd = join(dir, "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    writeFileSync(
      join(localDir, "persona.md"),
      `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`,
    )

    createPersonaMemory(readCharacterPack(localDir), cwd, home()).forget(LINE)

    expect(homePersona("local")).toBeUndefined()
    expect(readFileSync(join(localDir, "persona.md"), "utf8")).toContain(`- ${LINE}`)
  })
})

describe("onChange（画面のサイドバーへ流し直す口）", () => {
  it("書けたときだけ、更新後の一覧を渡して呼ぶ", () => {
    const changes: (readonly string[])[] = []
    const memory = createPersonaMemory(
      readCharacterPack(writeBundledPack("架空")),
      dir,
      home(),
      (lines) => changes.push(lines),
    )

    memory.remember(LINE)

    expect(changes).toEqual([[LINE]])
  })

  it("受け付けられなかった回（上限・1ターン2回目）は呼ばない", () => {
    const changes: (readonly string[])[] = []
    const memory = createPersonaMemory(
      readCharacterPack(writeBundledPack("架空")),
      dir,
      home(),
      (lines) => changes.push(lines),
    )

    memory.remember("あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1))
    memory.remember(LINE)
    memory.remember("同じターンの2行目")

    expect(changes).toEqual([[LINE]])
  })

  it("消せたときも、更新後の一覧を渡して呼ぶ（消せなかった回は呼ばない）", () => {
    const changes: (readonly string[])[] = []
    const pack = readCharacterPack(writeBundledPack("架空"))
    const memory = createPersonaMemory(pack, dir, home(), (lines) => changes.push(lines))

    memory.remember(LINE)
    memory.finishTurn()
    changes.length = 0

    memory.forget("覚えていないこと")
    memory.forget(LINE)

    expect(changes).toEqual([[]])
  })
})

describe("readRememberedLines", () => {
  it("ホームの写しがあれば、そこから `- ` を外した一覧を返す（古い→新しいの順）", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))
    const memory = createPersonaMemory(pack, dir, home())
    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")

    expect(readRememberedLines(pack, home())).toEqual([LINE, "星を見るのが好き"])
  })

  it("写しが無ければ、いま出しているパックの人格から読む", () => {
    const pack = readCharacterPack(
      writeBundledPack("架空", `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`),
    )

    expect(readRememberedLines(pack, home())).toEqual([LINE])
  })

  it("節が無ければ空", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))

    expect(readRememberedLines(pack, home())).toEqual([])
  })
})

describe("forgetRememberedLineFromScreen（画面の「編集」から1行消す）", () => {
  it("完全一致した1行だけを消し、更新後の一覧を返す（節より前は変わらない）", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))
    const memory = createPersonaMemory(pack, dir, home())
    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")

    expect(forgetRememberedLineFromScreen(pack, dir, LINE, home())).toEqual(["星を見るのが好き"])
    expect(beforeSection(homePersona("架空") ?? "")).toBe(`${PERSONA}\n`)
  })

  it("**1ターン1行の上限は掛からない**（続けて2行消せる）", () => {
    const pack = readCharacterPack(writeBundledPack("架空"))
    const memory = createPersonaMemory(pack, dir, home())
    memory.remember("覚えたこと1")
    memory.finishTurn()
    memory.remember("覚えたこと2")

    expect(forgetRememberedLineFromScreen(pack, dir, "覚えたこと1", home())).toEqual([
      "覚えたこと2",
    ])
    expect(forgetRememberedLineFromScreen(pack, dir, "覚えたこと2", home())).toEqual([])
  })

  it("起動先の characters/local と同じ名前のパックからは消せない（undefined）", () => {
    const cwd = join(dir, "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    writeFileSync(
      join(localDir, "persona.md"),
      `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`,
    )

    expect(
      forgetRememberedLineFromScreen(readCharacterPack(localDir), cwd, LINE, home()),
    ).toBeUndefined()
    expect(readFileSync(join(localDir, "persona.md"), "utf8")).toContain(`- ${LINE}`)
  })
})
