import { afterEach, beforeEach, describe, expect, it } from "bun:test"
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
  return new Date(year, month - 1, day, 12, 0, 0).getTime()
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
  const LIMIT_ALL = 1024

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

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual([
      { speaker: "user", text: "20日の依頼", date: "2026-09-20" },
      { speaker: "character", text: "21日のセリフ", date: "2026-09-21" },
    ])
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
    const recent = chatArchive.readRecent("fictional-pack", limit)

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
    const recent = chatArchive.readRecent("fictional-pack", 13)

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

    expect(chatArchive.readRecent("fictional-pack", 5)).toEqual([])
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

    const recent = chatArchive.readRecent("fictional-pack", LIMIT_ALL)

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

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual([
      { speaker: "user", text: "読める行", date: "2026-09-21" },
    ])
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

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual([])
  })

  it("アーカイブがまだ無い・isCharacterPackName を通らない名前のときは空", () => {
    const chatArchive = createChatArchive(root())

    expect(chatArchive.readRecent("fictional-pack", LIMIT_ALL)).toEqual([])
    expect(chatArchive.readRecent("../evil", LIMIT_ALL)).toEqual([])
  })

  it("別のパックの会話は混ざらない", () => {
    const chatArchive = createChatArchive(root())
    const at = noonOn(2026, 9, 21)
    chatArchive.append("pack-a", { speaker: "user", at, text: "pack-a の依頼", images: undefined })
    chatArchive.append("pack-b", { speaker: "user", at, text: "pack-b の依頼", images: undefined })

    expect(chatArchive.readRecent("pack-a", LIMIT_ALL).map((entry) => entry.text)).toEqual([
      "pack-a の依頼",
    ])
  })
})
