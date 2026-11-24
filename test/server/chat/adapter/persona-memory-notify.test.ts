import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createPersonaMemory,
  forgetRememberedLineFromScreen,
  readRememberedLines,
} from "../../../../src/server/chat/adapter/persona-memory.ts"
import { REMEMBERED_SECTION_HEADING } from "../../../../src/shared/character-pack/persona-section.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../../../../src/shared/chat/persona-memory.ts"
import { readPackAt } from "../../../fixture/character-pack-dir.ts"
import {
  beforeSection,
  DEFINITION_JSON,
  LINE,
  PERSONA,
  usePersonaMemoryHarness,
} from "../../../fixture/persona-memory-harness.ts"

const { dir, home, writeBundledPack, homePersona } =
  usePersonaMemoryHarness("persona-memory-notify")

describe("onChange（画面のサイドバーへ流し直す口）", () => {
  it("書けたときだけ、更新後の一覧を渡して呼ぶ", () => {
    const changes: (readonly string[])[] = []
    const memory = createPersonaMemory(
      readPackAt(writeBundledPack("fictional")),
      dir(),
      home(),
      (lines) => changes.push(lines),
    )

    memory.remember(LINE)

    expect(changes).toEqual([[LINE]])
  })

  it("受け付けられなかった回（上限・1ターン2回目）は呼ばず、上限で受け付けなかった行はターンの1行を使わない", () => {
    const changes: (readonly string[])[] = []
    const memory = createPersonaMemory(
      readPackAt(writeBundledPack("fictional")),
      dir(),
      home(),
      (lines) => changes.push(lines),
    )

    memory.remember("あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1))
    memory.remember(LINE)
    memory.remember("同じターンの2行目")

    expect(changes).toEqual([[LINE]])
  })

  it("消せたときも、更新後の一覧を渡して呼ぶ（一致しなかった回は呼ばず、ターンの1行も使わない）", () => {
    const changes: (readonly string[])[] = []
    const pack = readPackAt(writeBundledPack("fictional"))
    const memory = createPersonaMemory(pack, dir(), home(), (lines) => changes.push(lines))

    memory.remember(LINE)
    memory.finishTurn()
    changes.length = 0

    memory.forget("覚えていないこと")
    memory.forget(LINE)

    expect(changes).toEqual([[]])
  })
})

describe("書けなかったときの知らせ", () => {
  /** 書き込み先の親がファイルで、ディレクトリを作れない状態にする。 */
  function blockHome(): void {
    writeFileSync(home(), "")
  }

  it("書き足しが書けなかったときだけ onFailure を呼び、onChange は呼ばない", () => {
    const failures: { place: string; error: unknown }[] = []
    const changes: (readonly string[])[] = []
    const pack = readPackAt(writeBundledPack("fictional"))
    const memory = createPersonaMemory(
      pack,
      dir(),
      home(),
      (lines) => changes.push(lines),
      (place, error) => failures.push({ place, error }),
    )

    blockHome()
    memory.remember(LINE)

    expect(failures.map(({ place }) => place)).toEqual(["persona-remember"])
    expect(failures[0]?.error).toBeInstanceOf(Error)
    expect(changes).toEqual([])
  })

  it("消すのが書けなかったときは onFailure を呼び、一致なしでは呼ばない", () => {
    const failures: string[] = []
    const pack = readPackAt(
      writeBundledPack("fictional", `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`),
    )
    const memory = createPersonaMemory(
      pack,
      dir(),
      home(),
      () => {},
      (place) => failures.push(place),
    )

    memory.forget("覚えていないこと")
    expect(failures).toEqual([])

    blockHome()
    memory.forget(LINE)
    expect(failures).toEqual(["persona-forget"])
  })

  it("画面から消すのが書けなかったときは onFailure を呼び、結果は一致なしと同じ undefined", () => {
    const failures: string[] = []
    const pack = readPackAt(
      writeBundledPack("fictional", `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`),
    )

    blockHome()
    const result = forgetRememberedLineFromScreen(pack, dir(), LINE, home(), (place) =>
      failures.push(place),
    )

    expect(result).toBeUndefined()
    expect(failures).toEqual(["persona-forget"])
  })
})

describe("readRememberedLines", () => {
  it("ホームの写しがあれば、そこから `- ` を外した一覧を返す（古い→新しいの順）", () => {
    const pack = readPackAt(writeBundledPack("fictional"))
    const memory = createPersonaMemory(pack, dir(), home())
    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")

    expect(readRememberedLines(pack, home())).toEqual([LINE, "星を見るのが好き"])
  })

  it("写しが無ければ、いま出しているパックの人格から読む", () => {
    const pack = readPackAt(
      writeBundledPack("fictional", `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`),
    )

    expect(readRememberedLines(pack, home())).toEqual([LINE])
  })

  it("節が無ければ空", () => {
    const pack = readPackAt(writeBundledPack("fictional"))

    expect(readRememberedLines(pack, home())).toEqual([])
  })
})

describe("forgetRememberedLineFromScreen（画面の「編集」から1行消す）", () => {
  it("完全一致した1行だけを消し、更新後の一覧を返す（節より前は変わらない）", () => {
    const pack = readPackAt(writeBundledPack("fictional"))
    const memory = createPersonaMemory(pack, dir(), home())
    memory.remember(LINE)
    memory.finishTurn()
    memory.remember("星を見るのが好き")

    expect(forgetRememberedLineFromScreen(pack, dir(), LINE, home())).toEqual(["星を見るのが好き"])
    expect(beforeSection(homePersona("fictional") ?? "")).toBe(`${PERSONA}\n`)
  })

  it("**1ターン1行の上限は掛からない**（続けて2行消せる）", () => {
    const pack = readPackAt(writeBundledPack("fictional"))
    const memory = createPersonaMemory(pack, dir(), home())
    memory.remember("覚えたこと1")
    memory.finishTurn()
    memory.remember("覚えたこと2")

    expect(forgetRememberedLineFromScreen(pack, dir(), "覚えたこと1", home())).toEqual([
      "覚えたこと2",
    ])
    expect(forgetRememberedLineFromScreen(pack, dir(), "覚えたこと2", home())).toEqual([])
  })

  it("起動先の characters/local と同じ名前のパックからは消せない（undefined）", () => {
    const cwd = join(dir(), "cwd")
    const localDir = join(cwd, "characters", "local")
    mkdirSync(localDir, { recursive: true })
    writeFileSync(join(localDir, "character.json"), DEFINITION_JSON)
    writeFileSync(
      join(localDir, "persona.md"),
      `${PERSONA}\n${REMEMBERED_SECTION_HEADING}\n\n- ${LINE}\n`,
    )

    expect(forgetRememberedLineFromScreen(readPackAt(localDir), cwd, LINE, home())).toBeUndefined()
    expect(readFileSync(join(localDir, "persona.md"), "utf8")).toContain(`- ${LINE}`)
  })
})
