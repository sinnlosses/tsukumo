import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  describeMigration,
  describePrune,
  migrateChatSummaries,
  migrationPlace,
  pruneLeftovers,
} from "../../../scripts/shared/chat-summary-migration.ts"
import { createChatSummary } from "../../../src/server/chat/adapter/chat-summary.ts"
import { characterPackName } from "../../fixture/character.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional-pack")
const OTHER = characterPackName("fictional-other")

const BODY = "架空のあらすじの本文"
const TOPIC = "架空の話題の見出し"
const EPISODE_TITLE = "架空のエピソードの題"
const TO = "2026-09-20T10:02:00+09:00"

const dir = useTempDir("chat-summary-migration")

function place(): ReturnType<typeof migrationPlace> {
  return migrationPlace(dir())
}

function put(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
}

function summaryFile(name: string): string {
  return join(place().summaryRoot, name)
}

function archiveFile(pack: string, name: string): string {
  return join(place().archiveRoot, pack, name)
}

function putLegacy(pack: string, body: string, mark = "delivered"): void {
  put(summaryFile(`${pack}.md`), `${mark}\n${body}`)
}

function episodeLine(to: string): string {
  return JSON.stringify({ v: 1, id: "e1", from: to, to, title: EPISODE_TITLE, gist: "", cues: [] })
}

/** 置き場に並ぶパックのうち、`pack` 1つぶんの移行の結果。 */
function migratePack(
  placeOfPack: ReturnType<typeof migrationPlace>,
  pack: string,
  dryRun: boolean,
): ReturnType<typeof migrateChatSummaries>[number] {
  const found = migrateChatSummaries(placeOfPack, dryRun).find((result) => result.pack === pack)
  if (found === undefined) {
    throw new Error(`置き場にパックが無い: ${pack}`)
  }
  return found
}

describe("パック1つぶんの移行", () => {
  it("1: 新しい形が読めるときは何も書かず、新しい形の中身も変えない", () => {
    createChatSummary(PACK, place().summaryRoot).write("新しい本文", ["新しい見出し"], TO)
    putLegacy(PACK, BODY)
    const before = readFileSync(summaryFile(`${PACK}.summary.json`), "utf8")

    expect(migratePack(place(), PACK, false)).toEqual({
      kind: "skipped",
      pack: PACK,
      reason: "current",
    })
    expect(readFileSync(summaryFile(`${PACK}.summary.json`), "utf8")).toBe(before)
  })

  it("2: 旧い形から新しい形を書き、本文・話題・印を引き継ぎ、fold は最後の to にする", () => {
    putLegacy(PACK, BODY)
    put(summaryFile(`${PACK}.topics.json`), JSON.stringify([TOPIC]))
    put(
      archiveFile(PACK, "episode.jsonl"),
      `${episodeLine("2026-09-18T09:00:00+09:00")}\n${episodeLine(TO)}\n`,
    )

    expect(migratePack(place(), PACK, false).kind).toBe("migrated")

    const summary = createChatSummary(PACK, place().summaryRoot)
    expect(summary.read()).toEqual({ summary: BODY, delivered: true })
    expect(summary.readTopics()).toEqual([TOPIC])
    expect(summary.readFold()).toEqual({ kind: "through", at: TO })
  })

  it.each([
    ["episode.jsonl が無い", undefined],
    ["episode.jsonl が空", ""],
    ["最後の行が壊れている", `${episodeLine(TO)}\n{壊れた\n`],
    ["to が日時の形でない", `${episodeLine("昨日")}\n`],
  ])("3: %s ときは fold を unknown のまま残す", (_name, episode) => {
    putLegacy(PACK, BODY)
    if (episode !== undefined) {
      put(archiveFile(PACK, "episode.jsonl"), episode)
    }

    migratePack(place(), PACK, false)

    expect(createChatSummary(PACK, place().summaryRoot).readFold()).toEqual({ kind: "unknown" })
  })

  it("4: 新しい形が読めない JSON のときは旧い形から書き直す", () => {
    putLegacy(PACK, BODY)
    put(summaryFile(`${PACK}.summary.json`), "{壊れた")

    migratePack(place(), PACK, false)

    expect(createChatSummary(PACK, place().summaryRoot).read()?.summary).toBe(BODY)
  })

  it("5: 話題のファイルが無い・壊れているときは、本文に埋め込んだ最後の組から話題を読み、本文から組を除く", () => {
    putLegacy(PACK, `${BODY}\n<topics>\n- ${TOPIC}\n\n・二つ目\n</topics>`)
    put(summaryFile(`${PACK}.topics.json`), "{壊れた")

    migratePack(place(), PACK, false)

    const summary = createChatSummary(PACK, place().summaryRoot)
    expect(summary.readTopics()).toEqual([TOPIC, "二つ目"])
    expect(summary.read()?.summary).toBe(BODY)
  })

  it("5: 閉じの無い組は話題にせず、本文に残す", () => {
    putLegacy(PACK, `${BODY}\n<topics>\n- ${TOPIC}\n`)

    migratePack(place(), PACK, false)

    const summary = createChatSummary(PACK, place().summaryRoot)
    expect(summary.readTopics()).toEqual([])
    expect(summary.read()?.summary).toContain("<topics>")
  })

  it("5: 話題のファイルが読めるときはそちらを優先し、本文はそのまま", () => {
    putLegacy(PACK, `${BODY}\n<topics>\n- 埋め込み\n</topics>`)
    put(summaryFile(`${PACK}.topics.json`), JSON.stringify([TOPIC]))

    migratePack(place(), PACK, false)

    const summary = createChatSummary(PACK, place().summaryRoot)
    expect(summary.readTopics()).toEqual([TOPIC])
    expect(summary.read()?.summary).toContain("<topics>")
  })

  it("6: 1行目が delivered のときだけ渡し済み", () => {
    putLegacy(PACK, BODY, "delivered")
    putLegacy(OTHER, BODY, "????")

    migratePack(place(), PACK, false)
    migratePack(place(), OTHER, false)

    expect(createChatSummary(PACK, place().summaryRoot).read()?.delivered).toBe(true)
    expect(createChatSummary(OTHER, place().summaryRoot).read()?.delivered).toBe(false)
  })

  it("7: 話題のファイルだけで本文が無いときは何も書かない", () => {
    put(summaryFile(`${PACK}.topics.json`), JSON.stringify([TOPIC]))

    expect(migratePack(place(), PACK, false)).toEqual({
      kind: "skipped",
      pack: PACK,
      reason: "no-body",
    })
    expect(existsSync(summaryFile(`${PACK}.summary.json`))).toBe(false)
  })

  it("8: 読めない新しい形だけで旧い形が無いパックは何も書かない。置き場にパックが無ければ何も回らない", () => {
    expect(migrateChatSummaries(place(), false)).toEqual([])

    put(summaryFile(`${PACK}.summary.json`), "{壊れた")

    expect(migratePack(place(), PACK, false)).toEqual({
      kind: "skipped",
      pack: PACK,
      reason: "none",
    })
    expect(readFileSync(summaryFile(`${PACK}.summary.json`), "utf8")).toBe("{壊れた")
  })

  it("9: --dry-run は何も作らず変えず、書くはずだった内容を報告する", () => {
    putLegacy(PACK, BODY)
    put(archiveFile(PACK, "episode.jsonl"), `${episodeLine(TO)}\n`)
    const before = readdirSync(place().summaryRoot)

    const result = migratePack(place(), PACK, true)

    expect(result).toMatchObject({
      kind: "would-migrate",
      fold: { kind: "through", at: TO },
      topicCount: 0,
      delivered: true,
    })
    expect(readdirSync(place().summaryRoot)).toEqual(before)
  })
})

describe("migrateChatSummaries", () => {
  it("あらすじの置き場のパックを名前順に回し、報告に本文・話題・エピソードの題を含めない", () => {
    putLegacy(PACK, BODY)
    put(summaryFile(`${PACK}.topics.json`), JSON.stringify([TOPIC]))
    put(archiveFile(PACK, "episode.jsonl"), `${episodeLine(TO)}\n`)
    putLegacy(OTHER, `${BODY}\n<topics>\n- ${TOPIC}\n</topics>`)

    const results = migrateChatSummaries(place(), true)
    const report = describeMigration(results).join("\n")

    expect(results.map((result) => result.pack)).toEqual([OTHER, PACK])
    expect(report).toContain("fold=2026-09-20")
    for (const secret of [BODY, TOPIC, EPISODE_TITLE]) {
      expect(report).not.toContain(secret)
    }
  })
})

describe("pruneLeftovers", () => {
  function seed(): void {
    for (const name of ["kept.jsonl", "index.jsonl", "recalled.jsonl", "episode.jsonl"]) {
      put(archiveFile(PACK, name), "x")
      put(archiveFile(OTHER, name), "x")
    }
    put(archiveFile(PACK, "2026-09-20.jsonl"), "x")
    put(archiveFile(PACK, "images/2026-09-20-a.png"), "x")
    put(join(dir(), "visual", "gh-1", "a.png"), "xy")
    createChatSummary(PACK, place().summaryRoot).write(BODY, [], TO)
    putLegacy(PACK, BODY)
    put(summaryFile(`${PACK}.topics.json`), "[]")
    putLegacy(OTHER, BODY)
  }

  it("新しい形のあるパックでは旧形と episode.jsonl も消し、日付の jsonl・images/・新しい形は残す", () => {
    seed()

    pruneLeftovers(place(), dir(), false)

    expect(existsSync(join(dir(), "visual"))).toBe(false)
    expect(readdirSync(join(place().archiveRoot, PACK)).toSorted()).toEqual([
      "2026-09-20.jsonl",
      "images",
    ])
    expect(readdirSync(place().summaryRoot).toSorted()).toEqual([
      `${OTHER}.md`,
      `${PACK}.summary.json`,
    ])
  })

  it("新しい形の無いパックでは episode.jsonl を消さず、kept-no-current と報告する", () => {
    seed()

    const items = pruneLeftovers(place(), dir(), false)

    expect(existsSync(archiveFile(OTHER, "episode.jsonl"))).toBe(true)
    expect(existsSync(archiveFile(OTHER, "kept.jsonl"))).toBe(false)
    expect(items.find((item) => item.name === `${OTHER}/episode.jsonl`)?.outcome).toBe(
      "kept-no-current",
    )
  })

  it("--dry-run は一覧と大きさだけを返し、何も消さない", () => {
    seed()

    const items = pruneLeftovers(place(), dir(), true)

    expect(items.find((item) => item.name === "visual")).toMatchObject({
      outcome: "would-remove",
      bytes: 2,
    })
    expect(existsSync(join(dir(), "visual"))).toBe(true)
    expect(existsSync(archiveFile(PACK, "kept.jsonl"))).toBe(true)
    expect(describePrune(items)).toContain("visual\twould-remove\t2B")
  })
})
