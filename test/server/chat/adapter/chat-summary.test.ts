import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  createChatSummary,
  discardChatSummary,
  UNAVAILABLE_CHAT_SUMMARY,
} from "../../../../src/server/chat/adapter/chat-summary.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const PACK = characterPackName("fictional-pack")
const PACK_A = characterPackName("pack-a")
const PACK_B = characterPackName("pack-b")
const FICTIONAL_PACK = characterPackName("fictional")
const SECOND_PACK = characterPackName("fictional-2")

const textEncoder = new TextEncoder()
function byteLength(text: string): number {
  return textEncoder.encode(text).length
}

const SUMMARY = "利用者と最近読んだ本の話をした。次は続きの巻の感想を聞きたがっていた。"

/** 取り込んだ最後の行の時刻（架空）。 */
const FOLDED_AT = "2026-09-20T10:02:00+09:00"

const dir = useTempDir("chat-summary")

/** 書き込み先の親（本物の `~/.tsukumo/chat-summary` の代わり）。 */
function root(): string {
  return join(dir(), "chat-summary")
}

describe("createChatSummary", () => {
  it("write すると読める。写しが無かったときの印は「未渡し」", () => {
    const chatSummary = createChatSummary(PACK, root())

    chatSummary.write(SUMMARY, [], FOLDED_AT)

    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
  })

  it("write は書けたかどうかを返す", () => {
    const chatSummary = createChatSummary(PACK, root())
    expect(chatSummary.write(SUMMARY, [], FOLDED_AT)).toEqual({ kind: "written", droppedLines: 0 })

    writeFileSync(join(dir(), "blocked"), "")
    expect(createChatSummary(PACK, join(dir(), "blocked")).write(SUMMARY, [], FOLDED_AT)).toEqual({
      kind: "failed",
    })
  })

  it("write は印を変えない（「渡し済み」も「未渡し」もそのまま）", () => {
    const chatSummary = createChatSummary(PACK, root())
    chatSummary.markDelivered()

    chatSummary.write(SUMMARY, [], FOLDED_AT)

    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })

    chatSummary.markUndelivered()
    chatSummary.write("書き直したあらすじ", [], FOLDED_AT)

    expect(chatSummary.read()).toEqual({ summary: "書き直したあらすじ", delivered: false })
  })

  it("パックごとに別のファイルになる", () => {
    const a = createChatSummary(PACK_A, root())
    const b = createChatSummary(PACK_B, root())

    a.write(SUMMARY, [], FOLDED_AT)

    expect(a.read()?.summary).toBe(SUMMARY)
    expect(b.read()).toBeUndefined()
  })

  it("本文・話題・印・取り込んだところを1つの JSON に書き、一時ファイルを残さない", () => {
    const chatSummary = createChatSummary(PACK, root())

    chatSummary.write(SUMMARY, ["架空の見出し"], FOLDED_AT)

    expect(readdirSync(root())).toEqual(["fictional-pack.summary.json"])
    expect(JSON.parse(readFileSync(join(root(), "fictional-pack.summary.json"), "utf8"))).toEqual({
      v: 1,
      delivered: false,
      synopsis: SUMMARY,
      topics: ["架空の見出し"],
      fold: { kind: "through", at: FOLDED_AT },
    })
  })

  describe("取り込んだところ（fold）", () => {
    it("写しが無いときは unknown、write のあとは渡した時刻まで", () => {
      const chatSummary = createChatSummary(PACK, root())
      expect(chatSummary.readFold()).toEqual({ kind: "unknown" })

      chatSummary.write(SUMMARY, [], FOLDED_AT)

      expect(chatSummary.readFold()).toEqual({ kind: "through", at: FOLDED_AT })
    })

    it("markDelivered・markUndelivered は取り込んだところを変えない", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [], FOLDED_AT)

      chatSummary.markDelivered()

      expect(chatSummary.readFold()).toEqual({ kind: "through", at: FOLDED_AT })
    })
  })

  describe("書き込みの途中で落ちたとき", () => {
    it("書けなかったときは failed を返し、前の写しがそのまま読める", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, ["架空の見出し"], FOLDED_AT)
      chmodSync(root(), 0o555)
      try {
        expect(chatSummary.write("書けないあらすじ", [], "2026-09-21T10:00:00+09:00")).toEqual({
          kind: "failed",
        })
      } finally {
        chmodSync(root(), 0o755)
      }

      expect(chatSummary.read()?.summary).toBe(SUMMARY)
      expect(chatSummary.readFold()).toEqual({ kind: "through", at: FOLDED_AT })
    })

    it("rename の前に落ちて一時ファイルが残っていても、前の写しを読む", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [], FOLDED_AT)
      writeFileSync(join(root(), "fictional-pack.summary.json.0123456789ab.tmp"), '{"v":1,"deliv')

      expect(chatSummary.read()?.summary).toBe(SUMMARY)
      expect(chatSummary.readFold()).toEqual({ kind: "through", at: FOLDED_AT })
    })
  })

  describe("markUndelivered / markDelivered", () => {
    it("markUndelivered で印が「未渡し」に戻る。本文は保つ", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [], FOLDED_AT)

      chatSummary.markUndelivered()

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
    })

    it("markDelivered で印が「渡し済み」に戻る。本文は保つ", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [], FOLDED_AT)
      chatSummary.markUndelivered()

      chatSummary.markDelivered()

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
    })

    it("写しが無いまま markUndelivered を呼んでも落ちない", () => {
      const chatSummary = createChatSummary(PACK, root())

      expect(() => chatSummary.markUndelivered()).not.toThrow()
    })
  })

  describe("話題の見出し", () => {
    it("本文とは別の欄に持ち、本文には混ざらない", () => {
      const chatSummary = createChatSummary(PACK, root())

      chatSummary.write(SUMMARY, ["架空の新しい話題", "架空の古い話題"], FOLDED_AT)

      expect(chatSummary.readTopics()).toEqual(["架空の新しい話題", "架空の古い話題"])
      expect(chatSummary.read()?.summary).toBe(SUMMARY)
    })

    it("本文に <topics> の組の文字列が出ても、本文はそのまま・見出しは別の欄のまま", () => {
      const chatSummary = createChatSummary(PACK, root())
      const body = "架空の地の文。\n<topics>\n- 本文に出た架空の文字列\n</topics>\n続き。"

      chatSummary.write(body, ["架空の見出し"], FOLDED_AT)

      expect(chatSummary.read()?.summary).toBe(body)
      expect(chatSummary.readTopics()).toEqual(["架空の見出し"])
    })

    it("markDelivered・markUndelivered は見出しを変えない", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, ["架空の見出し"], FOLDED_AT)

      chatSummary.markDelivered()

      expect(chatSummary.readTopics()).toEqual(["架空の見出し"])
    })

    it("写しがまだ無いときは空", () => {
      expect(createChatSummary(PACK, root()).readTopics()).toEqual([])
    })
  })

  describe("8 KiB の上限", () => {
    it("本文が超えたら古いほうの行から落ちる。行の途中では切らない", () => {
      const chatSummary = createChatSummary(PACK, root())
      const lines = Array.from({ length: 200 }, (_, i) => `第${i}回のやり取りの短い要約行です。`)
      const summary = lines.join("\n")
      expect(byteLength(summary)).toBeGreaterThan(CHAT_MEMORY_BUDGET.synopsisBytes)

      const result = chatSummary.write(summary, [], FOLDED_AT)
      const record = chatSummary.read()
      expect(record).toBeDefined()
      const kept = record?.summary.split("\n") ?? []

      // 残ったのは末尾（新しいほう）の連続した行で、1件も途中で切られていない。
      expect(kept.length).toBeGreaterThan(0)
      expect(kept.length).toBeLessThan(lines.length)
      expect(result).toEqual({ kind: "written", droppedLines: lines.length - kept.length })
      expect(lines.slice(lines.length - kept.length)).toEqual(kept)
      expect(byteLength(record?.summary ?? "")).toBeLessThanOrEqual(
        CHAT_MEMORY_BUDGET.synopsisBytes,
      )
    })

    it("要約が1行だけで8 KiBを超えるとき（改行が無い）も空にならない", () => {
      const chatSummary = createChatSummary(PACK, root())
      const hugeSingleLine = "あ".repeat(6000) // 1文字3バイトなので 18,000 バイト超

      const result = chatSummary.write(hugeSingleLine, [], FOLDED_AT)
      const record = chatSummary.read()

      expect(result).toEqual({ kind: "written", droppedLines: 0 })
      expect(record?.summary).toBe(hugeSingleLine)
    })
  })

  describe("UNAVAILABLE_CHAT_SUMMARY", () => {
    it("読み書きとも何もしない", () => {
      expect(UNAVAILABLE_CHAT_SUMMARY.write(SUMMARY, [], FOLDED_AT)).toEqual({ kind: "failed" })
      expect(UNAVAILABLE_CHAT_SUMMARY.read()).toBeUndefined()
      expect(UNAVAILABLE_CHAT_SUMMARY.readTopics()).toEqual([])
      expect(UNAVAILABLE_CHAT_SUMMARY.readFold()).toEqual({ kind: "unknown" })
    })
  })
})

describe("discardChatSummary", () => {
  it("そのパックの写しだけを消し、ほかのパックの写しは残す", () => {
    createChatSummary(SECOND_PACK, root()).write(SUMMARY, [], FOLDED_AT)
    createChatSummary(FICTIONAL_PACK, root()).write(SUMMARY, [], FOLDED_AT)

    discardChatSummary(SECOND_PACK, root())

    expect(createChatSummary(SECOND_PACK, root()).read()).toBeUndefined()
    expect(createChatSummary(FICTIONAL_PACK, root()).read()?.summary).toBe(SUMMARY)
  })

  it("書きかけで残った一時ファイルも消す", () => {
    mkdirSync(root(), { recursive: true })
    for (const name of ["fictional.summary.json", "fictional.summary.json.0123456789ab.tmp"]) {
      writeFileSync(join(root(), name), "")
    }

    discardChatSummary(FICTIONAL_PACK, root())

    expect(readdirSync(root())).toEqual([])
  })

  it("写しが無くても投げない", () => {
    expect(() => discardChatSummary(FICTIONAL_PACK, root())).not.toThrow()
  })
})
