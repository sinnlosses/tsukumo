import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  CHAT_SUMMARY_LIMIT_BYTES,
  createChatSummary,
  discardChatSummary,
  UNAVAILABLE_CHAT_SUMMARY,
} from "../../../../src/server/chat/adapter/chat-summary.ts"
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

const dir = useTempDir("chat-summary")

/** 書き込み先の親（本物の `~/.tsukumo/chat-summary` の代わり）。 */
function root(): string {
  return join(dir(), "chat-summary")
}

describe("createChatSummary", () => {
  it("write すると読める。写しが無かったときの印は「未渡し」", () => {
    const chatSummary = createChatSummary(PACK, root())

    chatSummary.write(SUMMARY, [])

    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
  })

  it("write は書けたかどうかを返す", () => {
    const chatSummary = createChatSummary(PACK, root())
    expect(chatSummary.write(SUMMARY, [])).toEqual({ kind: "written", droppedLines: 0 })

    writeFileSync(join(dir(), "blocked"), "")
    expect(createChatSummary(PACK, join(dir(), "blocked")).write(SUMMARY, [])).toEqual({
      kind: "failed",
    })
  })

  it("write は印を変えない（「渡し済み」も「未渡し」もそのまま）", () => {
    const chatSummary = createChatSummary(PACK, root())
    chatSummary.markDelivered()

    chatSummary.write(SUMMARY, [])

    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })

    chatSummary.markUndelivered()
    chatSummary.write("書き直したあらすじ", [])

    expect(chatSummary.read()).toEqual({ summary: "書き直したあらすじ", delivered: false })
  })

  it("パックごとに別のファイルになる", () => {
    const a = createChatSummary(PACK_A, root())
    const b = createChatSummary(PACK_B, root())

    a.write(SUMMARY, [])

    expect(a.read()?.summary).toBe(SUMMARY)
    expect(b.read()).toBeUndefined()
  })

  it("印の行が要約の本文に混ざらない（1行目だけが印）", () => {
    const chatSummary = createChatSummary(PACK, root())

    chatSummary.write(SUMMARY, [])
    const path = join(root(), "fictional-pack.md")
    const raw = readFileSync(path, "utf8")

    expect(raw.split("\n")[0]).toBe("undelivered")
    expect(chatSummary.read()?.summary).not.toContain("delivered")
    expect(chatSummary.read()?.summary).toBe(SUMMARY)
  })

  describe("markUndelivered / markDelivered", () => {
    it("markUndelivered で印が「未渡し」に戻る。本文は保つ", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [])

      chatSummary.markUndelivered()

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
    })

    it("markDelivered で印が「渡し済み」に戻る。本文は保つ", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [])
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
    it("本文と別のファイルに書き、本文には混ざらない", () => {
      const chatSummary = createChatSummary(PACK, root())

      chatSummary.write(SUMMARY, ["架空の新しい話題", "架空の古い話題"])

      expect(chatSummary.readTopics()).toEqual(["架空の新しい話題", "架空の古い話題"])
      expect(chatSummary.read()?.summary).toBe(SUMMARY)
      expect(readFileSync(join(root(), "fictional-pack.md"), "utf8")).not.toContain(
        "架空の新しい話題",
      )
    })

    it("本文に <topics> の組の文字列が出ても、本文はそのまま・見出しは別の欄のまま", () => {
      const chatSummary = createChatSummary(PACK, root())
      const body = "架空の地の文。\n<topics>\n- 本文に出た架空の文字列\n</topics>\n続き。"

      chatSummary.write(body, ["架空の見出し"])

      expect(chatSummary.read()?.summary).toBe(body)
      expect(chatSummary.readTopics()).toEqual(["架空の見出し"])
    })

    it("見出しが0件でも書く（古い形の埋め込みを読み戻さない）", () => {
      const chatSummary = createChatSummary(PACK, root())
      mkdirSync(root(), { recursive: true })
      writeFileSync(
        join(root(), "fictional-pack.md"),
        "undelivered\n架空の古い形\n<topics>\n- 架空の古い話題\n</topics>",
      )

      chatSummary.write(SUMMARY, [])

      expect(chatSummary.readTopics()).toEqual([])
    })

    it("markDelivered・markUndelivered は見出しを変えない", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, ["架空の見出し"])

      chatSummary.markDelivered()

      expect(chatSummary.readTopics()).toEqual(["架空の見出し"])
    })

    it("見出しのファイルだけ書けなかったときは failed を返し、本文は書き直されている", () => {
      const chatSummary = createChatSummary(PACK, root())
      mkdirSync(join(root(), "fictional-pack.topics.json"), { recursive: true })

      expect(chatSummary.write(SUMMARY, ["架空の見出し"])).toEqual({ kind: "failed" })

      expect(chatSummary.read()?.summary).toBe(SUMMARY)
    })

    it("見出しのファイルだけ残って本文が無いときは、写しは無し・見出しは残ったものを読む", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, ["架空の見出し"])
      rmSync(join(root(), "fictional-pack.md"))

      expect(chatSummary.read()).toBeUndefined()
      expect(chatSummary.readTopics()).toEqual(["架空の見出し"])
    })

    it("写しがまだ無いときは空", () => {
      expect(createChatSummary(PACK, root()).readTopics()).toEqual([])
    })
  })

  describe("話題を本文に埋め込んでいた古い形（読みだけ）", () => {
    function legacy(body: string): ReturnType<typeof createChatSummary> {
      mkdirSync(root(), { recursive: true })
      writeFileSync(join(root(), "fictional-pack.md"), `delivered\n${body}`)
      return createChatSummary(PACK, root())
    }

    it("組の間の行を、書かれた順のまま取り出し、本文からは組を除く", () => {
      const chatSummary = legacy(
        [
          "架空のあらすじ。",
          "<topics>",
          "- 架空の新しい話題",
          "- 架空の二番目の話題",
          "</topics>",
        ].join("\n"),
      )

      expect(chatSummary.readTopics()).toEqual(["架空の新しい話題", "架空の二番目の話題"])
      expect(chatSummary.read()).toEqual({ summary: "架空のあらすじ。", delivered: true })
    })

    it("箇条の印（- * ・ 1.）を落とし、空行は数えない", () => {
      const chatSummary = legacy(
        ["<topics>", "* 架空A", "", "・架空B", "2. 架空C", "</topics>"].join("\n"),
      )

      expect(chatSummary.readTopics()).toEqual(["架空A", "架空B", "架空C"])
    })

    it("同じ行に閉じまで書かれていても取り出す", () => {
      expect(legacy("<topics>- 架空の話題</topics>").readTopics()).toEqual(["架空の話題"])
    })

    it("組が2つあるときは最後の組を読む", () => {
      const chatSummary = legacy(
        [
          "<analysis>",
          "<topics>",
          "- 下書きの架空の話題",
          "</topics>",
          "</analysis>",
          "<summary>",
          "<topics>",
          "- 本文の架空の話題",
          "</topics>",
          "</summary>",
        ].join("\n"),
      )

      expect(chatSummary.readTopics()).toEqual(["本文の架空の話題"])
    })

    it("印が無い・閉じが無いときは何も出さず、閉じの無い組は本文に残す", () => {
      expect(legacy("架空の要約。話題の節は無い。").readTopics()).toEqual([])

      const unclosed = legacy("架空の要約。\n<topics>\n- 架空の話題\n")
      expect(unclosed.readTopics()).toEqual([])
      expect(unclosed.read()?.summary).toContain("<topics>")
    })

    it("印だけを書き換えても、埋め込んだ話題は読み戻せる", () => {
      const chatSummary = legacy("架空のあらすじ\n<topics>\n- 架空の話題\n</topics>")

      chatSummary.markUndelivered()

      expect(chatSummary.readTopics()).toEqual(["架空の話題"])
      expect(chatSummary.read()).toEqual({ summary: "架空のあらすじ", delivered: false })
    })

    it("話題のファイルが壊れているときも、埋め込みから読む", () => {
      const chatSummary = legacy("架空のあらすじ\n<topics>\n- 架空の話題\n</topics>")
      writeFileSync(join(root(), "fictional-pack.topics.json"), "{壊れた")

      expect(chatSummary.readTopics()).toEqual(["架空の話題"])
    })

    it("話題のファイルがあれば、そちらを優先する", () => {
      const chatSummary = legacy("架空のあらすじ\n<topics>\n- 埋め込みの話題\n</topics>")
      writeFileSync(join(root(), "fictional-pack.topics.json"), JSON.stringify(["別の欄の話題"]))

      expect(chatSummary.readTopics()).toEqual(["別の欄の話題"])
      expect(chatSummary.read()?.summary).toContain("<topics>")
    })
  })

  describe("印が無い・読めないとき", () => {
    it("印の1行目が既定の文字列と違うファイルは「未渡し」扱いになる", () => {
      const chatSummary = createChatSummary(PACK, root())
      chatSummary.write(SUMMARY, [])
      // 壊れた印（既知の2つの文字列のどちらでもない）に手で書き換える。
      const path = join(root(), "fictional-pack.md")
      const body = readFileSync(path, "utf8").split("\n").slice(1).join("\n")
      writeFileSync(path, `????\n${body}`)

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
    })
  })

  describe("8 KiB の上限", () => {
    it("超えたら古いほうの行から落ちる。行の途中では切らない", () => {
      const chatSummary = createChatSummary(PACK, root())
      const lines = Array.from({ length: 200 }, (_, i) => `第${i}回のやり取りの短い要約行です。`)
      const summary = lines.join("\n")
      expect(byteLength(summary)).toBeGreaterThan(CHAT_SUMMARY_LIMIT_BYTES)

      const result = chatSummary.write(summary, [])
      const record = chatSummary.read()
      expect(record).toBeDefined()
      const kept = record?.summary.split("\n") ?? []

      // 残ったのは末尾（新しいほう）の連続した行で、1件も途中で切られていない。
      expect(kept.length).toBeGreaterThan(0)
      expect(kept.length).toBeLessThan(lines.length)
      expect(result).toEqual({ kind: "written", droppedLines: lines.length - kept.length })
      expect(lines.slice(lines.length - kept.length)).toEqual(kept)

      // ファイル全体（印の行を含む）が上限に収まっている。
      const path = join(root(), "fictional-pack.md")
      expect(readFileSync(path).byteLength).toBeLessThanOrEqual(CHAT_SUMMARY_LIMIT_BYTES)
    })

    it("要約が1行だけで8 KiBを超えるとき（改行が無い）も空にならない", () => {
      const chatSummary = createChatSummary(PACK, root())
      const hugeSingleLine = "あ".repeat(6000) // 1文字3バイトなので 18,000 バイト超

      const result = chatSummary.write(hugeSingleLine, [])
      const record = chatSummary.read()

      expect(result).toEqual({ kind: "written", droppedLines: 0 })
      expect(record).toBeDefined()
      expect(record?.summary).not.toBe("")
      expect(record?.summary).toBe(hugeSingleLine)
    })
  })

  describe("UNAVAILABLE_CHAT_SUMMARY", () => {
    it("読み書きとも何もしない", () => {
      expect(UNAVAILABLE_CHAT_SUMMARY.write(SUMMARY, [])).toEqual({ kind: "failed" })
      expect(UNAVAILABLE_CHAT_SUMMARY.read()).toBeUndefined()
      expect(UNAVAILABLE_CHAT_SUMMARY.readTopics()).toEqual([])
    })
  })
})

describe("discardChatSummary", () => {
  it("そのパックの写しだけを消し、ほかのパックの写しは残す", () => {
    createChatSummary(SECOND_PACK, root()).write(SUMMARY, [])
    createChatSummary(FICTIONAL_PACK, root()).write(SUMMARY, [])

    discardChatSummary(SECOND_PACK, root())

    expect(createChatSummary(SECOND_PACK, root()).read()).toBeUndefined()
    expect(createChatSummary(FICTIONAL_PACK, root()).read()?.summary).toBe(SUMMARY)
  })

  it("話題の見出しのファイルも消す", () => {
    createChatSummary(FICTIONAL_PACK, root()).write(SUMMARY, ["架空の話題"])

    discardChatSummary(FICTIONAL_PACK, root())

    expect(readdirSync(root())).toEqual([])
  })

  it("写しが無くても投げない", () => {
    expect(() => discardChatSummary(FICTIONAL_PACK, root())).not.toThrow()
  })
})
