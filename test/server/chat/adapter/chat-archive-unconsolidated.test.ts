import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { createChatArchive } from "../../../../src/server/chat/adapter/chat-archive.ts"
import type {
  ChatArchive,
  ChatUnconsolidatedRange,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional-pack")
const FICTIONAL_PROJECT = "架空プロジェクト"

const dir = useTempDir("chat-archive")

/** 書き込み先の親（本物の `~/.tsukumo/chat-archive` の代わり）。 */
function root(): string {
  return join(dir(), "chat-archive")
}

/** ある日のローカル正午のエポックミリ秒（日をまたぐ心配をしない値）。 */
function noonOn(year: number, month: number, day: number): number {
  return Temporal.ZonedDateTime.from({
    year,
    month,
    day,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone: Temporal.Now.timeZoneId(),
  }).epochMilliseconds
}

function readLines<T = unknown>(path: string): T[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): T => JSON.parse(line))
}

describe("createChatArchive の unconsolidated", () => {
  // フィクスチャは手で書いた架空の依頼だけ（実物の会話は使わない）。1行12バイト（全角4文字）に
  // 揃えてあるので、上限（バイト）と落ちる件数の対応が読める。
  const TWELVE_BYTES = "あいうえ"
  const AFTER_EPISODES = { kind: "after-episodes" } as const satisfies ChatUnconsolidatedRange

  function appendRequest(chatArchive: ChatArchive, day: number, text: string): void {
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: noonOn(2026, 9, day),
      text,
      images: undefined,
      imageFiles: undefined,
    })
  }

  /** その日のファイルに書いた行の `at`（ISO）。 */
  function writtenAt(day: number): string {
    const [record] = readLines<{ at: string }>(
      join(root(), PACK, `2026-09-${String(day).padStart(2, "0")}.jsonl`),
    )
    if (record === undefined) {
      throw new Error("行が書かれていない")
    }
    return record.at
  }

  it("エピソードが無ければアーカイブの最初から、窓の外の行を古い→新しいで返す", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, "19日の依頼")
    appendRequest(chatArchive, 20, "20日の依頼")
    appendRequest(chatArchive, 21, "21日の依頼")

    // 窓（recentBytes）には最新の1件だけが収まる大きさにする。
    const recentBytes = Buffer.byteLength("21日の依頼")
    const { entries, usedBytes, previousEpisodeTitle, episodesThrough, overflowed } =
      chatArchive.unconsolidated(PACK, { recentBytes, maxBytes: 1024 }, AFTER_EPISODES)

    expect(entries.map((entry) => entry.text)).toEqual(["19日の依頼", "20日の依頼"])
    expect(entries.map((entry) => entry.kind)).toEqual(["request", "request"])
    expect(previousEpisodeTitle).toBe("")
    expect(episodesThrough).toEqual({ kind: "none" })
    expect(usedBytes).toBe(Buffer.byteLength("19日の依頼") + Buffer.byteLength("20日の依頼"))
    expect(overflowed).toBe(false)
  })

  it("最後のエピソードの to より後の行だけを返す", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, "19日の依頼")
    appendRequest(chatArchive, 20, "20日の依頼")
    appendRequest(chatArchive, 21, "21日の依頼")
    chatArchive.appendEpisodes(PACK, [
      {
        from: writtenAt(19),
        to: writtenAt(19),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 1,
      },
    ])

    // 窓は使い切れないほど広く取り、to より後かどうかだけを見る。
    const { entries, previousEpisodeTitle, episodesThrough } = chatArchive.unconsolidated(
      PACK,
      { recentBytes: 0, maxBytes: 1024 },
      AFTER_EPISODES,
    )

    expect(entries.map((entry) => entry.text)).toEqual(["20日の依頼", "21日の依頼"])
    expect(previousEpisodeTitle).toBe("架空の見出し")
    expect(episodesThrough).toEqual({ kind: "through", at: writtenAt(19) })
  })

  it("to と同じ日のファイルは、to より後の行だけを返す", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, "19日の依頼")
    const hour = 3_600_000
    for (const [offset, text] of [
      [0, "20日の前の依頼"],
      [hour, "20日の後の依頼"],
    ] as const) {
      chatArchive.append(PACK, {
        mode: "chat",
        kind: "request",
        at: noonOn(2026, 9, 20) + offset,
        text,
        images: undefined,
        imageFiles: undefined,
      })
    }
    appendRequest(chatArchive, 21, "21日の依頼")
    // 20日の1行目（前の依頼）の時刻を to にする。
    const to = writtenAt(20)
    chatArchive.appendEpisodes(PACK, [
      { from: writtenAt(19), to, title: "架空の見出し", gist: "架空の要旨。", cues: [], weight: 1 },
    ])

    const { entries } = chatArchive.unconsolidated(
      PACK,
      { recentBytes: 0, maxBytes: 1024 },
      AFTER_EPISODES,
    )

    expect(entries.map((entry) => entry.text)).toEqual(["20日の後の依頼", "21日の依頼"])
  })

  it("maxBytes で古いほうから区切り、溢れる1件は載せない（usedBytes で溜まった量が分かる）", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, TWELVE_BYTES)
    appendRequest(chatArchive, 20, "かきくけ")
    appendRequest(chatArchive, 21, "さしすせ")

    // 1件（12バイト）は収まるが、2件目の途中までしか入らない上限。
    const { entries, usedBytes, overflowed } = chatArchive.unconsolidated(
      PACK,
      { recentBytes: 0, maxBytes: 13 },
      AFTER_EPISODES,
    )

    expect(entries.map((entry) => entry.text)).toEqual([TWELVE_BYTES])
    expect(usedBytes).toBe(Buffer.byteLength(TWELVE_BYTES))
    expect(overflowed).toBe(true)
  })

  it("先頭の1件だけで maxBytes を超えるときは、切らずにその1件だけを単独で返し overflowed は true", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, TWELVE_BYTES)
    appendRequest(chatArchive, 20, "かきくけ")

    const { entries, usedBytes, overflowed } = chatArchive.unconsolidated(
      PACK,
      { recentBytes: 0, maxBytes: 5 },
      AFTER_EPISODES,
    )

    expect(entries.map((entry) => entry.text)).toEqual([TWELVE_BYTES])
    expect(usedBytes).toBe(Buffer.byteLength(TWELVE_BYTES))
    expect(overflowed).toBe(true)
  })

  it("仕事の行も雑談の行と区別せずに返し、印とプロジェクトの名前が付く", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, "19日の雑談")
    chatArchive.append(PACK, {
      mode: "work",
      kind: "conclusion",
      at: noonOn(2026, 9, 20),
      text: "20日の結論",
      project: FICTIONAL_PROJECT,
    })

    const { entries } = chatArchive.unconsolidated(
      PACK,
      { recentBytes: 0, maxBytes: 1024 },
      AFTER_EPISODES,
    )

    expect(entries.map(({ kind, origin, text }) => ({ kind, origin, text }))).toEqual([
      { kind: "request", origin: { mode: "chat" }, text: "19日の雑談" },
      {
        kind: "conclusion",
        origin: { mode: "work", project: FICTIONAL_PROJECT },
        text: "20日の結論",
      },
    ])
  })

  it.each([
    {
      name: "after の行より後で through まで。直前の見出しは to が after を過ぎない最後のエピソード",
      after: () => ({ kind: "through", at: writtenAt(19) }) as const,
      texts: ["20日の依頼"],
      title: "19日の見出し",
    },
    {
      name: "after が none ならアーカイブの最初から",
      after: () => ({ kind: "none" }) as const,
      texts: ["19日の依頼", "20日の依頼"],
      title: "",
    },
  ])("between は $name", ({ after, texts, title }) => {
    const chatArchive = createChatArchive(root())
    for (const day of [19, 20, 21]) {
      appendRequest(chatArchive, day, `${String(day)}日の依頼`)
    }
    chatArchive.appendEpisodes(PACK, [
      {
        from: writtenAt(19),
        to: writtenAt(19),
        title: "19日の見出し",
        gist: "架空。",
        cues: [],
        weight: 1,
      },
      {
        from: writtenAt(20),
        to: writtenAt(20),
        title: "20日の見出し",
        gist: "架空。",
        cues: [],
        weight: 1,
      },
    ])

    const batch = chatArchive.unconsolidated(
      PACK,
      { recentBytes: 0, maxBytes: 1024 },
      { kind: "between", after: after(), through: writtenAt(20) },
    )

    expect(batch.entries.map((entry) => entry.text)).toEqual(texts)
    expect(batch.previousEpisodeTitle).toBe(title)
    expect(batch.episodesThrough).toEqual({ kind: "through", at: writtenAt(20) })
  })
})
