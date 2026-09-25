import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createChatArchive,
  discardChatArchive,
} from "../../../../src/server/chat/adapter/chat-archive.ts"
import {
  type ChatArchive,
  type ChatEpisodeDraft,
  type ChatReadbackLimits,
} from "../../../../src/server/session-driver/core/session-driver.ts"

// フィクスチャは手で書いた架空の依頼・セリフだけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const REQUEST_TEXT = "ただいま"
const SPEECH_TEXT = "おかえり"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-chat-archive-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 書き込み先の親（本物の `~/.tsukumo/chat-archive` の代わり）。 */
function root(): string {
  return join(dir, "chat-archive")
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

function readLines(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown)
}

describe("createChatArchive", () => {
  it("依頼の行は v / at / pack / speaker / text を持ち、images は無いときはキー自体が無い", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append("fictional-pack", {
      speaker: "user",
      at,
      text: REQUEST_TEXT,
      images: undefined,
    })

    const [record] = readLines(join(root(), "fictional-pack", "2026-09-21.jsonl"))
    expect(record).toMatchObject({
      v: 1,
      pack: "fictional-pack",
      speaker: "user",
      text: REQUEST_TEXT,
    })
    expect(record).not.toHaveProperty("images")
    expect(record).not.toHaveProperty("expression")
  })

  it("セリフの行は表情を持つ", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append("fictional-pack", {
      speaker: "character",
      at,
      text: SPEECH_TEXT,
      expression: "proud",
    })

    const [record] = readLines(join(root(), "fictional-pack", "2026-09-21.jsonl"))
    expect(record).toMatchObject({
      v: 1,
      pack: "fictional-pack",
      speaker: "character",
      text: SPEECH_TEXT,
      expression: "proud",
    })
    expect(record).not.toHaveProperty("images")
  })

  it("`at` は行だけで時刻が決まる ISO 8601（オフセット付き）で、日付部分はローカル時刻と揃う", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append("fictional-pack", {
      speaker: "user",
      at,
      text: REQUEST_TEXT,
      images: undefined,
    })

    const [record] = readLines(join(root(), "fictional-pack", "2026-09-21.jsonl")) as {
      at: string
    }[]
    expect(record?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
    expect(record?.at.slice(0, 10)).toBe("2026-09-21")
  })

  it("添えた画像は1枚以上あるときだけ枚数を持つ", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append("fictional-pack", { speaker: "user", at, text: REQUEST_TEXT, images: 2 })

    const [record] = readLines(join(root(), "fictional-pack", "2026-09-21.jsonl"))
    expect(record).toMatchObject({ images: 2 })
  })

  it("追記する（上書きしない）。往復すると依頼とセリフが1行ずつ増える", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append("fictional-pack", {
      speaker: "user",
      at,
      text: "1回目の依頼",
      images: undefined,
    })
    chatArchive.append("fictional-pack", {
      speaker: "character",
      at,
      text: "1回目のセリフ",
      expression: "proud",
    })
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at,
      text: "2回目の依頼",
      images: undefined,
    })

    const records = readLines(join(root(), "fictional-pack", "2026-09-21.jsonl")) as {
      text: string
    }[]
    expect(records.map((record) => record.text)).toEqual([
      "1回目の依頼",
      "1回目のセリフ",
      "2回目の依頼",
    ])
  })

  it("パックごとに別のファイルになる", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)

    chatArchive.append("pack-a", { speaker: "user", at, text: "pack-a の依頼", images: undefined })
    chatArchive.append("pack-b", { speaker: "user", at, text: "pack-b の依頼", images: undefined })

    expect(readLines(join(root(), "pack-a", "2026-09-21.jsonl"))).toHaveLength(1)
    expect(readLines(join(root(), "pack-b", "2026-09-21.jsonl"))).toHaveLength(1)
  })

  it("日ごとに別のファイルになる", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: noonOn(2026, 9, 21),
      text: "21日の依頼",
      images: undefined,
    })
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: noonOn(2026, 9, 22),
      text: "22日の依頼",
      images: undefined,
    })

    expect(readdirSync(join(root(), "fictional-pack")).sort()).toEqual([
      "2026-09-21.jsonl",
      "2026-09-22.jsonl",
    ])
  })

  it("isCharacterPackName を通らない名前では何も書かない", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.append("../evil", {
      speaker: "user",
      at: noonOn(2026, 9, 21),
      text: REQUEST_TEXT,
      images: undefined,
    })

    expect(existsSync(root())).toBe(false)
  })

  it("書けなくても例外を投げない", () => {
    // パックの置き場になるはずのパスに、先にファイルを置いておく（ディレクトリを作れなくする）。
    mkdirSync(root(), { recursive: true })
    const blocked = join(root(), "fictional-pack")
    mkdirSync(blocked)
    // ディレクトリのはずの場所と衝突させる: 日付ファイルの置き場をファイルにしておく。
    const asFile = join(blocked, "2026-09-21.jsonl")
    mkdirSync(asFile) // ファイルの代わりにディレクトリを置き、appendFileSync を失敗させる。

    const chatArchive = createChatArchive(root())

    expect(() =>
      chatArchive.append("fictional-pack", {
        speaker: "user",
        at: noonOn(2026, 9, 21),
        text: REQUEST_TEXT,
        images: undefined,
      }),
    ).not.toThrow()
  })
})

describe("createChatArchive の readRecent", () => {
  // フィクスチャは手で書いた架空の文面だけ。1行12バイト（全角4文字）に揃えてあるので、
  // 上限（バイト）と落ちる件数の対応が読める。
  const TWELVE_BYTES = "あいうえ"
  const LIMIT_ALL: ChatReadbackLimits = { recentBytes: 1024, keptBytes: 1024 }

  /** 窓の広さだけを変える（旗のぶんは使い切れないほど広いまま）。 */
  function withRecentBytes(recentBytes: number): ChatReadbackLimits {
    return { recentBytes, keptBytes: 1024 }
  }

  /** 生の1行を書く（壊れた行を置くため。`append` を通さない）。 */
  function writeRawLines(fileName: string, lines: readonly string[]): void {
    const packDir = join(root(), "fictional-pack")
    mkdirSync(packDir, { recursive: true })
    writeFileSync(join(packDir, fileName), lines.map((line) => `${line}\n`).join(""))
  }

  it("新しい日のファイルから遡り、古い→新しいの順で返す", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: noonOn(2026, 9, 20),
      text: "20日の依頼",
      images: undefined,
    })
    chatArchive.append("fictional-pack", {
      speaker: "character",
      at: noonOn(2026, 9, 21),
      text: "21日のセリフ",
      expression: "proud",
    })

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual({
      kept: [],
      recent: [
        { speaker: "user", text: "20日の依頼", date: "2026-09-20" },
        { speaker: "character", text: "21日のセリフ", date: "2026-09-21" },
      ],
    })
  })

  it("上限を超えたぶんは古い側から落ちる", () => {
    const chatArchive = createChatArchive(root())
    const texts = ["いちばん古い", "まんなか", "いちばん新しい"]
    for (const [index, text] of texts.entries()) {
      chatArchive.append("fictional-pack", {
        speaker: "user",
        at: noonOn(2026, 9, 19 + index),
        text,
        images: undefined,
      })
    }

    // 新しい2件ぶん（"まんなか" 24 バイト + "いちばん新しい" 21 バイト）だけが収まる上限。
    const limit = Buffer.byteLength("まんなか") + Buffer.byteLength("いちばん新しい")
    const { recent } = chatArchive.readRecent("fictional-pack", withRecentBytes(limit))

    expect(recent.map((entry) => entry.text)).toEqual(["まんなか", "いちばん新しい"])
  })

  it("行の途中では切れない（溢れる1件は丸ごと載せない）", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at,
      text: TWELVE_BYTES,
      images: undefined,
    })
    chatArchive.append("fictional-pack", {
      speaker: "character",
      at,
      text: "かきくけ",
      expression: "proud",
    })

    // 1件（12バイト）は収まるが、2件目の途中までしか入らない上限。
    const { recent } = chatArchive.readRecent("fictional-pack", withRecentBytes(13))

    expect(recent.map((entry) => entry.text)).toEqual(["かきくけ"])
    // 途中で切られた断片が混ざらない。
    expect(recent.map((entry) => entry.text).join("")).not.toContain("あい")
  })

  it("1件だけで上限を超えるときは空（行の途中で切らない）", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: noonOn(2026, 9, 21),
      text: TWELVE_BYTES,
      images: undefined,
    })

    expect(chatArchive.readRecent("fictional-pack", withRecentBytes(5))).toEqual({
      kept: [],
      recent: [],
    })
  })

  it("表情も画像の枚数も返さない（話者の別・文面・日付だけ）", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    chatArchive.append("fictional-pack", { speaker: "user", at, text: REQUEST_TEXT, images: 2 })
    chatArchive.append("fictional-pack", {
      speaker: "character",
      at,
      text: SPEECH_TEXT,
      expression: "proud",
    })

    const { recent } = chatArchive.readRecent("fictional-pack", LIMIT_ALL)

    expect(recent).toEqual([
      { speaker: "user", text: REQUEST_TEXT, date: "2026-09-21" },
      { speaker: "character", text: SPEECH_TEXT, date: "2026-09-21" },
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

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual({
      kept: [],
      recent: [{ speaker: "user", text: "読める行", date: "2026-09-21" }],
    })
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

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual({ kept: [], recent: [] })
  })

  it("アーカイブがまだ無い・isCharacterPackName を通らない名前のときは空", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual({ kept: [], recent: [] })
    expect(chatArchive.readRecent("../evil", LIMIT_ALL)).toEqual({ kept: [], recent: [] })
  })

  it("別のパックの会話は混ざらない", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    chatArchive.append("pack-a", { speaker: "user", at, text: "pack-a の依頼", images: undefined })
    chatArchive.append("pack-b", { speaker: "user", at, text: "pack-b の依頼", images: undefined })

    expect(chatArchive.readRecent("pack-a", LIMIT_ALL).recent.map((entry) => entry.text)).toEqual([
      "pack-a の依頼",
    ])
  })
})

describe("createChatArchive の readRecent（旗の読み戻し）", () => {
  // **`keep` ツールは無くなった**（`docs/chat-mode.md` 4.9「窓から溢れた会話は定着で畳む」の
  // 「「残す」旗はやめる」）ので、旗はツールの口ではなく `kept.jsonl` へ直接フィクスチャを
  // 置いて用意する。`readRecent` が旗を読む側の挙動だけがここに残る（書く側は消えた）。
  // フィクスチャは手で書いた架空の文面だけ（実物の会話は使わない）。
  const KEEP_ALL: ChatReadbackLimits = { recentBytes: 1024, keptBytes: 1024 }

  /** 索引の置き場（パックごとに1つ）。 */
  function keptIndexPath(): string {
    return join(root(), "fictional-pack", "kept.jsonl")
  }

  /** その日の正午から `seconds` 秒後（ターンごとに時刻をずらすため）。 */
  function afterNoon(day: number, seconds: number): number {
    return Temporal.ZonedDateTime.from({
      year: 2026,
      month: 9,
      day,
      hour: 12,
      minute: 0,
      second: seconds,
      timeZone: Temporal.Now.timeZoneId(),
    }).epochMilliseconds
  }

  /** その日のファイルに書いた最後の行の `at`（ISO）。 */
  function lastWrittenAt(day: number): string {
    const lines = readLines(
      join(root(), "fictional-pack", `2026-09-${String(day).padStart(2, "0")}.jsonl`),
    ) as { at: string }[]
    const last = lines.at(-1)
    if (last === undefined) {
      throw new Error("行が書かれていない")
    }
    return last.at
  }

  /** 旗のフィクスチャを1行、`kept.jsonl` へ直接足す（`keep` ツールの代わり）。 */
  function markKept(at: string): void {
    appendFileSync(keptIndexPath(), `${JSON.stringify({ v: 1, at, pack: "fictional-pack" })}\n`)
  }

  it("窓を使い切っても、旗の付いた件は読み戻しに入る", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(19, 0),
      text: "残したい古い話",
      images: undefined,
    })
    markKept(lastWrittenAt(19))
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(20, 0),
      text: "その場で済む話",
      images: undefined,
    })
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(21, 0),
      text: "いちばん新しい話",
      images: undefined,
    })

    // 窓にはいちばん新しい1件しか入らない広さ。
    const limits: ChatReadbackLimits = {
      recentBytes: Buffer.byteLength("いちばん新しい話"),
      keptBytes: 1024,
    }
    const { kept, recent } = chatArchive.readRecent("fictional-pack", limits)

    expect(recent.map((entry) => entry.text)).toEqual(["いちばん新しい話"])
    expect(kept).toEqual([{ speaker: "user", text: "残したい古い話", date: "2026-09-19" }])
  })

  it("窓に入っている件は、旗のぶんに重ねない", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(20, 0),
      text: "その場で済む話",
      images: undefined,
    })
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(21, 0),
      text: "残したい新しい話",
      images: undefined,
    })
    markKept(lastWrittenAt(21))

    const { kept, recent } = chatArchive.readRecent("fictional-pack", KEEP_ALL)

    expect(recent.map((entry) => entry.text)).toEqual(["その場で済む話", "残したい新しい話"])
    expect(kept).toEqual([])
  })

  it("旗が増え続けても、旗のぶんは決めた上限を超えない（古い旗から落ちる）", () => {
    const chatArchive = createChatArchive(root())
    // 同じ長さ（22バイト）の架空の文面を5ターンぶん、全部に旗を立てる。
    const texts = [1, 2, 3, 4, 5].map((index) => `残したい話その${index}`)
    for (const [index, text] of texts.entries()) {
      const day = 17 + index
      chatArchive.append("fictional-pack", {
        speaker: "user",
        at: afterNoon(day, 0),
        text,
        images: undefined,
      })
      markKept(lastWrittenAt(day))
    }

    // 窓は0バイト（5件とも窓の外）、旗のぶんは2件ぶんだけ。
    const keptBytes = Buffer.byteLength("残したい話その4") + Buffer.byteLength("残したい話その5")
    const { kept } = chatArchive.readRecent("fictional-pack", { recentBytes: 0, keptBytes })

    expect(kept.map((entry) => entry.text)).toEqual(["残したい話その4", "残したい話その5"])
    const usedBytes = kept.reduce((total, entry) => total + Buffer.byteLength(entry.text), 0)
    expect(usedBytes).toBeLessThanOrEqual(keptBytes)
  })

  it("旗の無い既存の行（v: 1）はそのまま読め、索引が無くても落ちない", () => {
    const packDir = join(root(), "fictional-pack")
    mkdirSync(packDir, { recursive: true })
    writeFileSync(
      join(packDir, "2026-09-21.jsonl"),
      `${JSON.stringify({
        v: 1,
        at: "2026-09-21T12:00:00+09:00",
        pack: "fictional-pack",
        speaker: "user",
        text: "旗を知らないころの行",
      })}\n`,
    )
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent("fictional-pack", KEEP_ALL)).toEqual({
      kept: [],
      recent: [{ speaker: "user", text: "旗を知らないころの行", date: "2026-09-21" }],
    })
  })

  it("索引が壊れている・指す行が見つからないときも、例外を投げず窓はそのまま読める", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(21, 0),
      text: "読める行",
      images: undefined,
    })
    writeFileSync(
      keptIndexPath(),
      [
        "{壊れた JSON",
        JSON.stringify({ v: 99, at: "2026-09-18T12:00:00+09:00" }),
        // 形は正しいが、指す先の日付のファイルそのものが無い。
        JSON.stringify({ v: 1, at: "2026-09-01T12:00:00+09:00", pack: "fictional-pack" }),
      ]
        .map((line) => `${line}\n`)
        .join(""),
    )

    expect(() => chatArchive.readRecent("fictional-pack", KEEP_ALL)).not.toThrow()
    expect(chatArchive.readRecent("fictional-pack", KEEP_ALL)).toEqual({
      kept: [],
      recent: [{ speaker: "user", text: "読める行", date: "2026-09-21" }],
    })
  })
})

describe("createChatArchive の unconsolidated", () => {
  // フィクスチャは手で書いた架空の依頼だけ（実物の会話は使わない）。1行12バイト（全角4文字）に
  // 揃えてあるので、上限（バイト）と落ちる件数の対応が読める。
  const TWELVE_BYTES = "あいうえ"

  function appendRequest(chatArchive: ChatArchive, day: number, text: string): void {
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: noonOn(2026, 9, day),
      text,
      images: undefined,
    })
  }

  /** その日のファイルに書いた行の `at`（ISO）。 */
  function writtenAt(day: number): string {
    const [record] = readLines(
      join(root(), "fictional-pack", `2026-09-${String(day).padStart(2, "0")}.jsonl`),
    ) as {
      at: string
    }[]
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
    const { entries, usedBytes, previousEpisodeTitle } = chatArchive.unconsolidated(
      "fictional-pack",
      {
        recentBytes,
        maxBytes: 1024,
      },
    )

    expect(entries.map((entry) => entry.text)).toEqual(["19日の依頼", "20日の依頼"])
    expect(entries.map((entry) => entry.speaker)).toEqual(["user", "user"])
    expect(previousEpisodeTitle).toBe("")
    expect(usedBytes).toBe(Buffer.byteLength("19日の依頼") + Buffer.byteLength("20日の依頼"))
  })

  it("最後のエピソードの to より後の行だけを返す", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, "19日の依頼")
    appendRequest(chatArchive, 20, "20日の依頼")
    appendRequest(chatArchive, 21, "21日の依頼")
    chatArchive.appendEpisodes("fictional-pack", [
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
    const { entries, previousEpisodeTitle } = chatArchive.unconsolidated("fictional-pack", {
      recentBytes: 0,
      maxBytes: 1024,
    })

    expect(entries.map((entry) => entry.text)).toEqual(["20日の依頼", "21日の依頼"])
    expect(previousEpisodeTitle).toBe("架空の見出し")
  })

  it("maxBytes で古いほうから区切り、溢れる1件は載せない（usedBytes で溜まった量が分かる）", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 19, TWELVE_BYTES)
    appendRequest(chatArchive, 20, "かきくけ")
    appendRequest(chatArchive, 21, "さしすせ")

    // 1件（12バイト）は収まるが、2件目の途中までしか入らない上限。
    const { entries, usedBytes } = chatArchive.unconsolidated("fictional-pack", {
      recentBytes: 0,
      maxBytes: 13,
    })

    expect(entries.map((entry) => entry.text)).toEqual([TWELVE_BYTES])
    expect(usedBytes).toBe(Buffer.byteLength(TWELVE_BYTES))
  })

  it("パック名が名前として通らないときは空", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.unconsolidated("../evil", { recentBytes: 0, maxBytes: 1024 })).toEqual({
      entries: [],
      usedBytes: 0,
      previousEpisodeTitle: "",
    })
  })
})

describe("createChatArchive の appendEpisodes", () => {
  function episodeIndexLines(): unknown[] {
    return readLines(join(root(), "fictional-pack", "episode.jsonl"))
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

    chatArchive.appendEpisodes("fictional-pack", [draft(), draft({ title: "2件目の見出し" })])

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

    chatArchive.appendEpisodes("fictional-pack", [draft()])
    chatArchive.appendEpisodes("fictional-pack", [draft(), draft()])

    const ids = episodeIndexLines().map((line) => (line as { id: string }).id)
    expect(ids).toEqual(["2026-09-25-1", "2026-09-25-2", "2026-09-25-3"])
  })

  it("パック名が通らない・0件のときは書かない", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.appendEpisodes("../evil", [draft()])
    chatArchive.appendEpisodes("fictional-pack", [])

    expect(existsSync(join(root(), "fictional-pack", "episode.jsonl"))).toBe(false)
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
    chatArchive.appendEpisodes("fictional-pack", [
      draft({ title: "散歩の話", gist: "散歩に行った話。", weight: 1 }),
      draft({ title: "散歩の話その2", gist: "また散歩に行った話。", weight: 3 }),
    ])

    const all = chatArchive.recallList("fictional-pack", "散歩", 1024, NOW)
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
    const limited = chatArchive.recallList("fictional-pack", "散歩", firstCandidateBytes, NOW)
    expect(limited).toEqual({
      kind: "found",
      candidates: [{ id: "2026-09-25-2", title: "散歩の話その2", gist: "また散歩に行った話。" }],
    })
  })

  it("当たらなければ not-found", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.appendEpisodes("fictional-pack", [draft()])

    expect(chatArchive.recallList("fictional-pack", "宇宙船", 1024, NOW)).toEqual({
      kind: "not-found",
    })
  })

  it("パック名が通らない・エピソードがまだ無いときは not-found", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.recallList("../evil", "架空", 1024, NOW)).toEqual({ kind: "not-found" })
    expect(chatArchive.recallList("fictional-pack", "架空", 1024, NOW)).toEqual({
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
    chatArchive.append("fictional-pack", {
      speaker: "user",
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
    })
  }

  function writtenAt(day: number, index: number): string {
    const lines = readLines(
      join(root(), "fictional-pack", `2026-09-${String(day).padStart(2, "0")}.jsonl`),
    ) as { at: string }[]
    const record = lines[index]
    if (record === undefined) {
      throw new Error("行が書かれていない")
    }
    return record.at
  }

  function recalledLines(): unknown[] {
    return readLines(join(root(), "fictional-pack", "recalled.jsonl"))
  }

  it("その範囲の逐語を古いほうから読み、開いたことを recalled.jsonl に記録する", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    appendRequest(chatArchive, 25, 1, "2件目の依頼")
    appendRequest(chatArchive, 25, 2, "3件目の依頼（範囲の外）")
    chatArchive.appendEpisodes("fictional-pack", [
      {
        from: writtenAt(25, 0),
        to: writtenAt(25, 1),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 2,
      },
    ])

    const result = chatArchive.recallEpisode("fictional-pack", "2026-09-25-1", 1024, OPENED_AT)

    expect(result).toEqual({
      kind: "found",
      entries: [
        { speaker: "user", text: "1件目の依頼", date: "2026-09-25" },
        { speaker: "user", text: "2件目の依頼", date: "2026-09-25" },
      ],
      overflowed: false,
    })
    expect(recalledLines()).toEqual([{ v: 1, id: "2026-09-25-1", at: expect.any(String) }])
  })

  it("limitBytes を超えるぶんは載せず、overflowed: true を返す", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    appendRequest(chatArchive, 25, 1, "2件目の依頼")
    chatArchive.appendEpisodes("fictional-pack", [
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
      "fictional-pack",
      "2026-09-25-1",
      Buffer.byteLength("1件目の依頼"),
      OPENED_AT,
    )

    expect(result).toEqual({
      kind: "found",
      entries: [{ speaker: "user", text: "1件目の依頼", date: "2026-09-25" }],
      overflowed: true,
    })
  })

  it("無い id・パック名が通らないときは not-found（recalled.jsonl も増えない）", () => {
    const chatArchive = createChatArchive(root())
    appendRequest(chatArchive, 25, 0, "1件目の依頼")
    chatArchive.appendEpisodes("fictional-pack", [
      {
        from: writtenAt(25, 0),
        to: writtenAt(25, 0),
        title: "架空の見出し",
        gist: "架空の要旨。",
        cues: [],
        weight: 2,
      },
    ])

    expect(chatArchive.recallEpisode("fictional-pack", "no-such-id", 1024, OPENED_AT)).toEqual({
      kind: "not-found",
    })
    expect(chatArchive.recallEpisode("../evil", "2026-09-25-1", 1024, OPENED_AT)).toEqual({
      kind: "not-found",
    })
    expect(existsSync(join(root(), "fictional-pack", "recalled.jsonl"))).toBe(false)
  })
})

describe("discardChatArchive", () => {
  /** パック1つぶんの置き場に、日ごとの会話と索引と旗の3種を置く（中身は形だけ）。 */
  function writeArchiveOf(packName: string): string {
    const packDir = join(root(), packName)
    mkdirSync(packDir, { recursive: true })
    for (const fileName of ["2026-09-21.jsonl", "index.jsonl", "kept.jsonl"]) {
      writeFileSync(join(packDir, fileName), "{}\n")
    }
    return packDir
  }

  it("そのパックの置き場をディレクトリごと消し、ほかのパックの置き場は残す", () => {
    const deleted = writeArchiveOf("fictional-2")
    const other = writeArchiveOf("fictional")

    discardChatArchive("fictional-2", root())

    expect(existsSync(deleted)).toBe(false)
    expect(readdirSync(other).toSorted()).toEqual(["2026-09-21.jsonl", "index.jsonl", "kept.jsonl"])
  })

  it("パックの名前として通らない値ではパスを組み立てず、何も消さない", () => {
    writeArchiveOf("fictional")

    discardChatArchive("..", join(root(), "fictional"))
    discardChatArchive("", root())

    expect(existsSync(join(root(), "fictional", "index.jsonl"))).toBe(true)
  })

  it("置き場が無くても投げない", () => {
    expect(() => discardChatArchive("fictional", root())).not.toThrow()
  })
})
