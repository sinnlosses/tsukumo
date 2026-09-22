import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs"
import {
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

import { createChatArchive } from "../../../src/server/adapter/chat-archive.ts"
import {
  type ChatArchive,
  type ChatReadbackLimits,
} from "../../../src/server/core/session-driver.ts"

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

  it("テストは一時ディレクトリだけに書き、本物のホームには触らない", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: noonOn(2026, 9, 21),
      text: REQUEST_TEXT,
      images: undefined,
    })

    expect(readdirSync(root())).toEqual(["fictional-pack"])
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

describe("createChatArchive の「残す」旗", () => {
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

  /** 依頼を1件だけ書いてターンを終える（旗を立てるかどうかを渡す）。 */
  function runTurn(chatArchive: ChatArchive, at: number, text: string, keep: boolean): void {
    chatArchive.append("fictional-pack", { speaker: "user", at, text, images: undefined })
    if (keep) {
      chatArchive.keep()
    }
    chatArchive.finishTurn()
  }

  it("旗を立てたターンの行だけが索引に積まれ、索引は文面を持たない", () => {
    const chatArchive = createChatArchive(root())
    runTurn(chatArchive, afterNoon(19, 0), "残したい話", true)
    runTurn(chatArchive, afterNoon(20, 0), "その場で済む話", false)

    const marks = readLines(keptIndexPath())

    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({ v: 1, pack: "fictional-pack" })
    // **文面は複製しない**（会話がディスクの上に2つできない）。
    expect(marks[0]).not.toHaveProperty("text")
    expect(marks[0]).not.toHaveProperty("speaker")
  })

  it("旗を立てずに終えたターンでは索引そのものを作らない", () => {
    const chatArchive = createChatArchive(root())
    runTurn(chatArchive, afterNoon(21, 0), "その場で済む話", false)

    expect(existsSync(keptIndexPath())).toBe(false)
  })

  it("ターンの途中で立てた旗は、そのあとのセリフにも付く（指すのは1往復）", () => {
    const chatArchive = createChatArchive(root())
    const at = afterNoon(21, 0)
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at,
      text: "残したい依頼",
      images: undefined,
    })
    chatArchive.keep()
    chatArchive.append("fictional-pack", {
      speaker: "character",
      at: afterNoon(21, 1),
      text: "残したいセリフ",
      expression: "proud",
    })
    chatArchive.finishTurn()

    expect(readLines(keptIndexPath())).toHaveLength(2)
  })

  it("窓を使い切っても、旗の付いた件は読み戻しに入る", () => {
    const chatArchive = createChatArchive(root())
    runTurn(chatArchive, afterNoon(19, 0), "残したい古い話", true)
    runTurn(chatArchive, afterNoon(20, 0), "その場で済む話", false)
    runTurn(chatArchive, afterNoon(21, 0), "いちばん新しい話", false)

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
    runTurn(chatArchive, afterNoon(20, 0), "その場で済む話", false)
    runTurn(chatArchive, afterNoon(21, 0), "残したい新しい話", true)

    const { kept, recent } = chatArchive.readRecent("fictional-pack", KEEP_ALL)

    expect(recent.map((entry) => entry.text)).toEqual(["その場で済む話", "残したい新しい話"])
    expect(kept).toEqual([])
  })

  it("旗が増え続けても、旗のぶんは決めた上限を超えない（古い旗から落ちる）", () => {
    const chatArchive = createChatArchive(root())
    // 同じ長さ（22バイト）の架空の文面を5ターンぶん、全部に旗を立てる。
    const texts = [1, 2, 3, 4, 5].map((index) => `残したい話その${index}`)
    for (const [index, text] of texts.entries()) {
      runTurn(chatArchive, afterNoon(17 + index, 0), text, true)
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
    runTurn(chatArchive, afterNoon(21, 0), "読める行", false)
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

  it("旗を立てたまま書けなくても例外を投げない", () => {
    const chatArchive = createChatArchive(root())
    chatArchive.append("fictional-pack", {
      speaker: "user",
      at: afterNoon(21, 0),
      text: "残したい話",
      images: undefined,
    })
    chatArchive.keep()
    // 索引のはずの場所にディレクトリを置き、appendFileSync を失敗させる。
    mkdirSync(keptIndexPath(), { recursive: true })

    expect(() => chatArchive.finishTurn()).not.toThrow()
  })
})

describe("createChatArchive の日ごとの索引", () => {
  // フィクスチャは手で書いた架空の見出し・依頼だけ（実物の会話は使わない。
  // docs/coding-standards.md「会話内容の扱い」）。
  const READ_ALL = 1024

  /** 見出しの索引の置き場（パックごとに1つ）。 */
  function dayIndexPath(): string {
    return join(root(), "fictional-pack", "index.jsonl")
  }

  /** ローカル時刻での今日（見出しが付く日）。 */
  function today(): string {
    return Temporal.Now.plainDateISO().toString()
  }

  /** 架空の見出しを索引に直接置く（日付を選ぶため、ツールの口は通さない）。 */
  function writeIndexFixture(headings: readonly { date: string; line: string }[]): void {
    mkdirSync(join(root(), "fictional-pack"), { recursive: true })
    writeFileSync(
      dayIndexPath(),
      headings
        .map(
          (heading) =>
            `${JSON.stringify({ v: 1, date: heading.date, pack: "fictional-pack", line: heading.line })}\n`,
        )
        .join(""),
    )
  }

  /** 架空の依頼を1件だけ持つ、その日のファイルを置く。 */
  function writeDayFixture(date: string, texts: readonly string[]): void {
    mkdirSync(join(root(), "fictional-pack"), { recursive: true })
    writeFileSync(
      join(root(), "fictional-pack", `${date}.jsonl`),
      texts
        .map(
          (text, index) =>
            `${JSON.stringify({
              v: 1,
              at: `${date}T12:0${index}:00+09:00`,
              pack: "fictional-pack",
              speaker: "user",
              text,
            })}\n`,
        )
        .join(""),
    )
  }

  it("見出しは今日の日付の行として積まれ、書けるのは1ターンに1行", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.writeIndex("fictional-pack", "架空の見出しその1")
    chatArchive.writeIndex("fictional-pack", "同じターンの2行目")
    chatArchive.finishTurn()
    chatArchive.writeIndex("fictional-pack", "次のターンの見出し")

    expect(readLines(dayIndexPath())).toEqual([
      { v: 1, date: today(), pack: "fictional-pack", line: "架空の見出しその1" },
      { v: 1, date: today(), pack: "fictional-pack", line: "次のターンの見出し" },
    ])
  })

  it("空・改行つき・長すぎる見出しは書かない（1ターンの1行も使わない）", () => {
    const chatArchive = createChatArchive(root())

    chatArchive.writeIndex("fictional-pack", "   ")
    chatArchive.writeIndex("fictional-pack", "架空の見出し\n2行目")
    chatArchive.writeIndex("fictional-pack", "あ".repeat(121))
    chatArchive.writeIndex("../evil", "パック名が通らない見出し")
    chatArchive.writeIndex("fictional-pack", "書ける見出し")

    expect(readLines(dayIndexPath())).toEqual([
      { v: 1, date: today(), pack: "fictional-pack", line: "書ける見出し" },
    ])
  })

  it("索引に当たった日のファイルだけを開き、当たらない日のファイルは開かない", () => {
    writeIndexFixture([
      { date: "2026-09-19", line: "架空の見出し: 散歩の話" },
      { date: "2026-09-20", line: "架空の見出し: 料理の話" },
    ])
    writeDayFixture("2026-09-19", ["散歩の日の架空の依頼"])
    writeDayFixture("2026-09-20", ["料理の日の架空の依頼"])
    const chatArchive = createChatArchive(root())

    const spy = spyOn(fs, "readFileSync")
    const result = chatArchive.recall("fictional-pack", "散歩", READ_ALL)
    const opened = spy.mock.calls.map((call) => String(call[0]))
    spy.mockRestore()

    expect(result).toEqual({
      kind: "found",
      entries: [{ speaker: "user", text: "散歩の日の架空の依頼", date: "2026-09-19" }],
    })
    expect(opened).toEqual([dayIndexPath(), join(root(), "fictional-pack", "2026-09-19.jsonl")])
  })

  it("索引に当たる日が無ければ、日のファイルを1つも開かない", () => {
    writeIndexFixture([{ date: "2026-09-19", line: "架空の見出し: 散歩の話" }])
    writeDayFixture("2026-09-19", ["散歩の日の架空の依頼"])
    const chatArchive = createChatArchive(root())

    const spy = spyOn(fs, "readFileSync")
    const result = chatArchive.recall("fictional-pack", "当たらない言葉", READ_ALL)
    const opened = spy.mock.calls.map((call) => String(call[0]))
    spy.mockRestore()

    expect(result).toEqual({ kind: "not-found" })
    expect(opened).toEqual([dayIndexPath()])
  })

  it("同じ日に2行あれば、あとの行が索引になる", () => {
    writeIndexFixture([
      { date: "2026-09-19", line: "架空の見出し: 散歩の話" },
      { date: "2026-09-19", line: "架空の見出し: 書き直した見出し" },
    ])
    writeDayFixture("2026-09-19", ["その日の架空の依頼"])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.recall("fictional-pack", "書き直した", READ_ALL).kind).toBe("found")
    chatArchive.finishTurn()
    expect(chatArchive.recall("fictional-pack", "散歩", READ_ALL).kind).toBe("not-found")
  })

  it("日付そのものでも引ける（語は空白で分け、どれかに当たれば拾う）", () => {
    writeIndexFixture([{ date: "2026-09-19", line: "架空の見出し: 散歩の話" }])
    writeDayFixture("2026-09-19", ["その日の架空の依頼"])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.recall("fictional-pack", "当たらない言葉 2026-09-19", READ_ALL)).toEqual({
      kind: "found",
      entries: [{ speaker: "user", text: "その日の架空の依頼", date: "2026-09-19" }],
    })
  })

  it("引けるのは1ターンに1回で、ターンが終わればまた引ける", () => {
    writeIndexFixture([{ date: "2026-09-19", line: "架空の見出し: 散歩の話" }])
    writeDayFixture("2026-09-19", ["その日の架空の依頼"])
    const chatArchive = createChatArchive(root())

    expect(chatArchive.recall("fictional-pack", "散歩", READ_ALL).kind).toBe("found")

    const spy = spyOn(fs, "readFileSync")
    const second = chatArchive.recall("fictional-pack", "散歩", READ_ALL)
    const opened = spy.mock.calls.length
    spy.mockRestore()

    expect(second).toEqual({ kind: "already-recalled" })
    expect(opened).toBe(0)

    chatArchive.finishTurn()
    expect(chatArchive.recall("fictional-pack", "散歩", READ_ALL).kind).toBe("found")
  })

  it("当たった日が大きくても、渡した上限を超えて読まない（新しい側から1件ずつ）", () => {
    writeIndexFixture([{ date: "2026-09-19", line: "架空の見出し: 散歩の話" }])
    writeDayFixture("2026-09-19", ["古いほうの架空の依頼", "新しいほうの架空の依頼"])
    const chatArchive = createChatArchive(root())

    const limitBytes = Buffer.byteLength("新しいほうの架空の依頼")
    const result = chatArchive.recall("fictional-pack", "散歩", limitBytes)

    expect(result).toEqual({
      kind: "found",
      entries: [{ speaker: "user", text: "新しいほうの架空の依頼", date: "2026-09-19" }],
    })
  })

  it("索引が無い・壊れていても、直近の読み戻しはそのまま動く", () => {
    writeDayFixture("2026-09-21", ["索引を知らないころの架空の依頼"])
    const chatArchive = createChatArchive(root())
    const limits: ChatReadbackLimits = { recentBytes: 1024, keptBytes: 1024 }

    expect(chatArchive.recall("fictional-pack", "散歩", READ_ALL)).toEqual({ kind: "not-found" })
    expect(chatArchive.readRecent("fictional-pack", limits)).toEqual({
      kept: [],
      recent: [{ speaker: "user", text: "索引を知らないころの架空の依頼", date: "2026-09-21" }],
    })

    // 壊れた索引（JSON として読めない行・知らない版）を置いても同じ。
    mkdirSync(join(root(), "fictional-pack"), { recursive: true })
    writeFileSync(
      dayIndexPath(),
      `{壊れた行\n${JSON.stringify({ v: 2, date: "2026-09-19", pack: "fictional-pack", line: "散歩の話" })}\n`,
    )
    chatArchive.finishTurn()

    expect(() => chatArchive.recall("fictional-pack", "散歩", READ_ALL)).not.toThrow()
    expect(chatArchive.readRecent("fictional-pack", limits).recent).toHaveLength(1)
  })

  it("パック名が名前として通らないときは引かない", () => {
    expect(createChatArchive(root()).recall("../evil", "散歩", READ_ALL)).toEqual({
      kind: "not-found",
    })
  })
})
