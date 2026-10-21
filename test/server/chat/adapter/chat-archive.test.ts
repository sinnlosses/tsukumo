import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { readValidLines } from "../../../../src/server/adapter/lib/jsonl.ts"
import { createChatArchive } from "../../../../src/server/chat/adapter/chat-archive.ts"
import type {
  ChatArchive,
  ChatEpisodeDraft,
  ChatReadbackLimits,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional-pack")
const PACK_A = characterPackName("pack-a")
const PACK_B = characterPackName("pack-b")
const REQUEST_TEXT = "ただいま"
const SPEECH_TEXT = "おかえり"
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

describe("createChatArchive", () => {
  it("依頼の行は v / at / pack / mode / kind / speaker / text を持ち、images は1枚以上あるときだけ枚数を持つ", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at,
      text: REQUEST_TEXT,
      images: undefined,
      imageFiles: undefined,
    })
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at,
      text: REQUEST_TEXT,
      images: 2,
      imageFiles: undefined,
    })

    const [record, withImages] = readLines<{ at: string }>(join(root(), PACK, "2026-09-21.jsonl"))
    expect(record).toMatchObject({
      v: 2,
      pack: PACK,
      mode: "chat",
      kind: "request",
      speaker: "user",
      text: REQUEST_TEXT,
    })
    expect(record).not.toHaveProperty("images")
    expect(record).not.toHaveProperty("expression")
    expect(record).not.toHaveProperty("project")
    expect(withImages).toMatchObject({ images: 2 })
    expect(record?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
    expect(record?.at.slice(0, 10)).toBe("2026-09-21")
  })

  it("仕事の行は project を持つ（雑談の行は project のキー自体が無い）", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append(PACK, {
      mode: "work",
      kind: "request",
      at,
      text: REQUEST_TEXT,
      project: FICTIONAL_PROJECT,
      images: undefined,
    })
    chatArchive.append(PACK, {
      mode: "work",
      kind: "speech",
      at,
      text: SPEECH_TEXT,
      project: FICTIONAL_PROJECT,
      expression: "proud",
    })
    chatArchive.append(PACK, {
      mode: "work",
      kind: "conclusion",
      at,
      text: "架空の結論",
      project: FICTIONAL_PROJECT,
    })

    const records = readLines(join(root(), PACK, "2026-09-21.jsonl"))
    expect(records).toEqual([
      expect.objectContaining({
        v: 2,
        mode: "work",
        kind: "request",
        speaker: "user",
        project: FICTIONAL_PROJECT,
        text: REQUEST_TEXT,
      }),
      expect.objectContaining({
        v: 2,
        mode: "work",
        kind: "speech",
        speaker: "character",
        project: FICTIONAL_PROJECT,
        text: SPEECH_TEXT,
        expression: "proud",
      }),
      expect.objectContaining({
        v: 2,
        mode: "work",
        kind: "conclusion",
        speaker: "character",
        project: FICTIONAL_PROJECT,
        text: "架空の結論",
      }),
    ])
  })

  it("パックごとに別のファイルになる", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append(PACK_A, {
      mode: "chat",
      kind: "request",
      at,
      text: "pack-a の依頼",
      images: undefined,
      imageFiles: undefined,
    })
    chatArchive.append(PACK_B, {
      mode: "chat",
      kind: "request",
      at,
      text: "pack-b の依頼",
      images: undefined,
      imageFiles: undefined,
    })

    expect(readLines(join(root(), PACK_A, "2026-09-21.jsonl"))).toHaveLength(1)
    expect(readLines(join(root(), PACK_B, "2026-09-21.jsonl"))).toHaveLength(1)
  })

  it("日ごとに別のファイルになる", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: noonOn(2026, 9, 21),
      text: "21日の依頼",
      images: undefined,
      imageFiles: undefined,
    })
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: noonOn(2026, 9, 22),
      text: "22日の依頼",
      images: undefined,
      imageFiles: undefined,
    })

    expect(readdirSync(join(root(), PACK)).toSorted()).toEqual([
      "2026-09-21.jsonl",
      "2026-09-22.jsonl",
    ])
  })

  it("書けなくても例外を投げない", () => {
    // パックの置き場になるはずのパスに、先にファイルを置いておく（ディレクトリを作れなくする）。
    mkdirSync(root(), { recursive: true })
    const blocked = join(root(), PACK)
    mkdirSync(blocked)
    // ディレクトリのはずの場所と衝突させる: 日付ファイルの置き場をファイルにしておく。
    const asFile = join(blocked, "2026-09-21.jsonl")
    mkdirSync(asFile) // ファイルの代わりにディレクトリを置き、appendFileSync を失敗させる。

    const chatArchive = createChatArchive(root())

    expect(() =>
      chatArchive.append(PACK, {
        mode: "chat",
        kind: "request",
        at: noonOn(2026, 9, 21),
        text: REQUEST_TEXT,
        images: undefined,
        imageFiles: undefined,
      }),
    ).not.toThrow()
  })
})

describe("createChatArchive の readRecent", () => {
  // フィクスチャは手で書いた架空の文面だけ。1行12バイト（全角4文字）に揃えてあるので、
  // 上限（バイト）と落ちる件数の対応が読める。
  const TWELVE_BYTES = "あいうえ"
  const LIMIT_ALL: ChatReadbackLimits = { recentBytes: 1024 }

  function withRecentBytes(recentBytes: number): ChatReadbackLimits {
    return { recentBytes }
  }

  /** 生の1行を書く（壊れた行を置くため。`append` を通さない）。 */
  function writeRawLines(fileName: string, lines: readonly string[]): void {
    const packDir = join(root(), PACK)
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, fileName), lines.map((line) => `${line}\n`).join(""))
  }

  it("新しい日のファイルから遡り、古い→新しいの順で返す", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: noonOn(2026, 9, 20),
      text: "20日の依頼",
      images: undefined,
      imageFiles: undefined,
    })
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "speech",
      at: noonOn(2026, 9, 21),
      text: "21日のセリフ",
      expression: "proud",
    })

    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([
      { kind: "request", origin: { mode: "chat" }, text: "20日の依頼", date: "2026-09-20" },
      { kind: "speech", origin: { mode: "chat" }, text: "21日のセリフ", date: "2026-09-21" },
    ])
  })

  it("上限を超えたぶんは古い側から落ちる", () => {
    const chatArchive = createChatArchive(root())
    const texts = ["いちばん古い", "まんなか", "いちばん新しい"]
    for (const [index, text] of texts.entries()) {
      chatArchive.append(PACK, {
        mode: "chat",
        kind: "request",
        at: noonOn(2026, 9, 19 + index),
        text,
        images: undefined,
        imageFiles: undefined,
      })
    }

    // 新しい2件ぶん（"まんなか" 24 バイト + "いちばん新しい" 21 バイト）だけが収まる上限。
    const limit = Buffer.byteLength("まんなか") + Buffer.byteLength("いちばん新しい")
    const recent = chatArchive.readRecent(PACK, withRecentBytes(limit))

    expect(recent.map((entry) => entry.text)).toEqual(["まんなか", "いちばん新しい"])
  })

  it("1件だけで上限を超えるときは空（行の途中で切らない）", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: noonOn(2026, 9, 21),
      text: TWELVE_BYTES,
      images: undefined,
      imageFiles: undefined,
    })

    expect(chatArchive.readRecent(PACK, withRecentBytes(5))).toEqual([])
  })

  it("表情も画像の枚数も返さない（話者の別・文面・日付だけ）", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at,
      text: REQUEST_TEXT,
      images: 2,
      imageFiles: undefined,
    })
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "speech",
      at,
      text: SPEECH_TEXT,
      expression: "proud",
    })

    const recent = chatArchive.readRecent(PACK, LIMIT_ALL)

    expect(recent).toEqual([
      { kind: "request", origin: { mode: "chat" }, text: REQUEST_TEXT, date: "2026-09-21" },
      { kind: "speech", origin: { mode: "chat" }, text: SPEECH_TEXT, date: "2026-09-21" },
    ])
  })

  it("壊れた行・知らない版・鍵が足りない行は1行ずつ飛ばす（例外を投げない）", () => {
    writeRawLines("2026-09-21.jsonl", [
      "{壊れた JSON",
      JSON.stringify({ v: 99, at: "2026-09-21T12:00:00+09:00", speaker: "user", text: "未来の版" }),
      JSON.stringify({ v: 1, at: "2026-09-21T12:00:00+09:00", speaker: "user" }),
      JSON.stringify({ v: 1, speaker: "user", text: "時刻が無い" }),
      JSON.stringify({
        v: 1,
        at: "2026-09-21T12:00:00+09:00",
        speaker: "誰か",
        text: "知らない話者",
      }),
      JSON.stringify({ v: 1, at: "2026-09-21T12:00:01+09:00", speaker: "user", text: "読める行" }),
    ])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([
      { kind: "request", origin: { mode: "chat" }, text: "読める行", date: "2026-09-21" },
    ])
  })

  it("v:2 の雑談の行も仕事の行も読み、仕事の行には印とプロジェクトの名前が付く", () => {
    writeRawLines("2026-09-21.jsonl", [
      JSON.stringify({
        v: 2,
        at: "2026-09-21T12:00:00+09:00",
        pack: PACK,
        mode: "chat",
        kind: "request",
        speaker: "user",
        text: "v2の雑談の行",
      }),
      JSON.stringify({
        v: 2,
        at: "2026-09-21T12:00:01+09:00",
        pack: PACK,
        mode: "work",
        project: FICTIONAL_PROJECT,
        kind: "request",
        speaker: "user",
        text: "v2の仕事の行",
      }),
    ])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([
      { kind: "request", origin: { mode: "chat" }, text: "v2の雑談の行", date: "2026-09-21" },
      {
        kind: "request",
        origin: { mode: "work", project: FICTIONAL_PROJECT },
        text: "v2の仕事の行",
        date: "2026-09-21",
      },
    ])
  })

  it("仕事の依頼・セリフ・結論を書いた順に、行の種類つきで読み戻す", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    const project = FICTIONAL_PROJECT
    chatArchive.append(PACK, {
      mode: "work",
      kind: "request",
      at,
      text: "架空の依頼",
      project,
      images: undefined,
    })
    chatArchive.append(PACK, {
      mode: "work",
      kind: "speech",
      at: at + 1000,
      text: "架空のセリフ",
      project,
      expression: "proud",
    })
    chatArchive.append(PACK, {
      mode: "work",
      kind: "conclusion",
      at: at + 2000,
      text: "架空の結論",
      project,
    })

    const origin = { mode: "work", project }
    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([
      { kind: "request", origin, text: "架空の依頼", date: "2026-09-21" },
      { kind: "speech", origin, text: "架空のセリフ", date: "2026-09-21" },
      { kind: "conclusion", origin, text: "架空の結論", date: "2026-09-21" },
    ])
  })

  it("project を持たない仕事の行は読まない", () => {
    writeRawLines("2026-09-21.jsonl", [
      JSON.stringify({
        v: 2,
        at: "2026-09-21T12:00:00+09:00",
        pack: PACK,
        mode: "work",
        kind: "request",
        speaker: "user",
        text: "プロジェクトの無い仕事の行",
      }),
    ])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([])
  })

  it("日付のファイル名でないものは読まない", () => {
    writeRawLines("notes.txt", [
      JSON.stringify({
        v: 1,
        at: "2026-09-21T12:00:00+09:00",
        speaker: "user",
        text: "別の置き手紙",
      }),
    ])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([])
  })

  it("アーカイブがまだ無いときは空", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent(PACK, LIMIT_ALL)).toEqual([])
  })

  it("別のパックの会話は混ざらない", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    chatArchive.append(PACK_A, {
      mode: "chat",
      kind: "request",
      at,
      text: "pack-a の依頼",
      images: undefined,
      imageFiles: undefined,
    })
    chatArchive.append(PACK_B, {
      mode: "chat",
      kind: "request",
      at,
      text: "pack-b の依頼",
      images: undefined,
      imageFiles: undefined,
    })

    expect(chatArchive.readRecent(PACK_A, LIMIT_ALL).map((entry) => entry.text)).toEqual([
      "pack-a の依頼",
    ])
  })
})

describe("createChatArchive の appendEpisodes", () => {
  function episodeIndexLines(): unknown[] {
    return readLines(join(root(), PACK, "episode.jsonl"))
  }

  function draft(overrides: Partial<ChatEpisodeDraft> = {}): ChatEpisodeDraft {
    return {
      from: "2026-09-25T14:00:00+09:00",
      to: "2026-09-25T14:30:00+09:00",
      title: "架空の見出し",
      gist: "架空の要旨。",
      cues: ["架空"],
      weight: 2,
      ...overrides,
    }
  }

  it("v / id / from / to / title / gist / cues / weight を持つ行を追記する。id は to のローカル日付＋通し番号", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.appendEpisodes(PACK, [draft(), draft({ title: "2件目の見出し" })])

    expect(episodeIndexLines()).toEqual([
      {
        v: 2,
        id: "2026-09-25-1",
        from: "2026-09-25T14:00:00+09:00",
        to: "2026-09-25T14:30:00+09:00",
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: ["架空"],
        weight: 2,
      },
      {
        v: 2,
        id: "2026-09-25-2",
        from: "2026-09-25T14:00:00+09:00",
        to: "2026-09-25T14:30:00+09:00",
        title: "2件目の見出し",
        gist: "架空の要旨。",
        cues: ["架空"],
        weight: 2,
      },
    ])
  })

  it("既にある行の続きから通し番号を振る（同じ日に何回書いても重ならない）", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.appendEpisodes(PACK, [draft()])
    chatArchive.appendEpisodes(PACK, [draft(), draft()])

    const ids = readLines<{ id: string }>(join(root(), PACK, "episode.jsonl")).map(
      (line) => line.id,
    )
    expect(ids).toEqual(["2026-09-25-1", "2026-09-25-2", "2026-09-25-3"])
  })

  it("0件のときは書かない", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.appendEpisodes(PACK, [])).toEqual({ kind: "written" })

    expect(existsSync(join(root(), PACK, "episode.jsonl"))).toBe(false)
  })

  it("書けたら written、書けなかったら failed を返す", () => {
    expect(createChatArchive(root()).appendEpisodes(PACK, [draft()])).toEqual({
      kind: "written",
    })

    // パックの置き場の名前でファイルを作っておくと、その下に索引を書けない。
    writeFileSync(join(root(), PACK_B), "")
    expect(createChatArchive(root()).appendEpisodes(PACK_B, [draft()])).toEqual({
      kind: "failed",
    })
  })

  it("書きかけで落ちて改行で終わっていない索引に足しても、足した行はすべて読める", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.appendEpisodes(PACK, [draft()])
    appendFileSync(join(root(), PACK, "episode.jsonl"), '{"v":2,"id":"2026-09-25-2","fr')

    chatArchive.appendEpisodes(PACK, [draft({ title: "あとの見出し" }), draft()])

    const titles = readValidLines(
      join(root(), PACK, "episode.jsonl"),
      z.object({ title: z.string() }),
    ).map((line) => line.title)
    expect(titles).toEqual(["架空の見出し", "あとの見出し", "架空の見出し"])
  })
})

describe("createChatArchive の recallList", () => {
  const NOW = Temporal.Instant.from("2026-09-26T00:00:00+09:00")

  function draft(overrides: Partial<ChatEpisodeDraft> = {}): ChatEpisodeDraft {
    return {
      from: "2026-09-25T14:00:00+09:00",
      to: "2026-09-25T14:30:00+09:00",
      title: "架空の見出し",
      gist: "架空の要旨。",
      cues: [],
      weight: 2,
      ...overrides,
    }
  }

  it("採点の高い順に id・title・gist を返す（limitBytes に収まる分だけ）", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.appendEpisodes(PACK, [
      draft({ title: "散歩の話", gist: "散歩に行った話。", weight: 1 }),
      draft({ title: "散歩の話その2", gist: "また散歩に行った話。", weight: 3 }),
    ])

    const all = chatArchive.recallList(PACK, "散歩", 1024, NOW)
    expect(all.kind).toBe("found")
    if (all.kind !== "found") {
      throw new Error("unreachable")
    }
    // weight が大きいほうが先（一致・新しさは同じ条件なので weight の差がそのまま順序に出る）。
    expect(all.candidates.map((candidate) => candidate.title)).toEqual([
      "散歩の話その2",
      "散歩の話",
    ])

    // 1件ぶんしか収まらない上限では、点の高い1件だけを返す。
    const firstCandidateBytes =
      Buffer.byteLength("散歩の話その2") + Buffer.byteLength("また散歩に行った話。")
    const limited = chatArchive.recallList(PACK, "散歩", firstCandidateBytes, NOW)
    expect(limited).toEqual({
      kind: "found",
      candidates: [{ id: "2026-09-25-2", title: "散歩の話その2", gist: "また散歩に行った話。" }],
    })
  })

  it("当たらなければ not-found", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.appendEpisodes(PACK, [draft()])

    expect(chatArchive.recallList(PACK, "宇宙船", 1024, NOW)).toEqual({
      kind: "not-found",
    })
  })

  it("エピソードがまだ無いときは not-found", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.recallList(PACK, "架空", 1024, NOW)).toEqual({
      kind: "not-found",
    })
  })
})

describe("createChatArchive の recallEpisode", () => {
  const OPENED_AT = Temporal.Instant.from("2026-09-26T00:00:00+09:00")

  function appendRequest(
    chatArchive: ChatArchive,
    day: number,
    second: number,
    text: string,
  ): void {
    chatArchive.append(PACK, {
      mode: "chat",
      kind: "request",
      at: Temporal.ZonedDateTime.from({
        year: 2026,
        month: 9,
        day,
        hour: 12,
        minute: 0,
        second,
        timeZone: Temporal.Now.timeZoneId(),
      }).epochMilliseconds,
      text,
      images: undefined,
      imageFiles: undefined,
    })
  }

  function writtenAt(day: number, index: number): string {
    const lines = readLines<{ at: string }>(
      join(root(), PACK, `2026-09-${String(day).padStart(2, "0")}.jsonl`),
    )
    const record = lines[index]
    if (record === undefined) {
      throw new Error("行が書かれていない")
    }
    return record.at
  }

  function recalledLines(): unknown[] {
    return readLines(join(root(), PACK, "recalled.jsonl"))
  }

  it("その範囲の逐語を古いほうから読み、開いたことを recalled.jsonl に記録する", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    appendRequest(chatArchive, 25, 1, "2件目の依頼")
    appendRequest(chatArchive, 25, 2, "3件目の依頼（範囲の外）")
    chatArchive.appendEpisodes(PACK, [
      {
        from: writtenAt(25, 0),
        to: writtenAt(25, 1),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 2,
      },
    ])

    const result = chatArchive.recallEpisode(PACK, "2026-09-25-1", 1024, OPENED_AT)

    expect(result).toEqual({
      kind: "found",
      entries: [
        { kind: "request", origin: { mode: "chat" }, text: "1件目の依頼", date: "2026-09-25" },
        { kind: "request", origin: { mode: "chat" }, text: "2件目の依頼", date: "2026-09-25" },
      ],
      overflowed: false,
    })
    expect(recalledLines()).toEqual([{ v: 1, id: "2026-09-25-1", at: expect.any(String) }])
  })

  it("limitBytes を超えるぶんは載せず、overflowed: true を返す", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    appendRequest(chatArchive, 25, 1, "2件目の依頼")
    chatArchive.appendEpisodes(PACK, [
      {
        from: writtenAt(25, 0),
        to: writtenAt(25, 1),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 2,
      },
    ])

    const result = chatArchive.recallEpisode(
      PACK,
      "2026-09-25-1",
      Buffer.byteLength("1件目の依頼"),
      OPENED_AT,
    )

    expect(result).toEqual({
      kind: "found",
      entries: [
        { kind: "request", origin: { mode: "chat" }, text: "1件目の依頼", date: "2026-09-25" },
      ],
      overflowed: true,
    })
  })

  it("範囲の中の仕事の行も、印とプロジェクトの名前つきで開く", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    const workAt = Temporal.Instant.from(writtenAt(25, 0)).epochMilliseconds + 1000
    chatArchive.append(PACK, {
      mode: "work",
      kind: "request",
      at: workAt,
      text: "仕事の架空の依頼",
      project: FICTIONAL_PROJECT,
      images: undefined,
    })
    chatArchive.appendEpisodes(PACK, [
      {
        from: writtenAt(25, 0),
        to: writtenAt(25, 1),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 2,
      },
    ])

    expect(chatArchive.recallEpisode(PACK, "2026-09-25-1", 1024, OPENED_AT)).toEqual({
      kind: "found",
      entries: [
        { kind: "request", origin: { mode: "chat" }, text: "1件目の依頼", date: "2026-09-25" },
        {
          kind: "request",
          origin: { mode: "work", project: FICTIONAL_PROJECT },
          text: "仕事の架空の依頼",
          date: "2026-09-25",
        },
      ],
      overflowed: false,
    })
  })

  it("無い id・パック名が通らないときは not-found（recalled.jsonl も増えない）", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    chatArchive.appendEpisodes(PACK, [
      {
        from: writtenAt(25, 0),
        to: writtenAt(25, 0),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 2,
      },
    ])

    expect(chatArchive.recallEpisode(PACK, "no-such-id", 1024, OPENED_AT)).toEqual({
      kind: "not-found",
    })
    expect(existsSync(join(root(), PACK, "recalled.jsonl"))).toBe(false)
  })
})
