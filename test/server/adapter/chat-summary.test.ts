import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  CHAT_SUMMARY_LIMIT_BYTES,
  createChatSummary,
  discardChatSummary,
} from "../../../src/server/adapter/chat-summary.ts"

const textEncoder = new TextEncoder()
function byteLength(text: string): number {
  return textEncoder.encode(text).length
}

// フィクスチャは手で書いた架空の要約だけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const SUMMARY = "利用者と最近読んだ本の話をした。次は続きの巻の感想を聞きたがっていた。"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsukumo-chat-summary-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 書き込み先の親（本物の `~/.tsukumo/chat-summary` の代わり）。 */
function root(): string {
  return join(dir, "chat-summary")
}

describe("createChatSummary", () => {
  it("写しが無いときは undefined", () => {
    const chatSummary = createChatSummary("fictional-pack", root())

    expect(chatSummary.read()).toBeUndefined()
  })

  it("write すると読める。印は「渡し済み」になる", () => {
    const chatSummary = createChatSummary("fictional-pack", root())

    chatSummary.write(SUMMARY)

    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
  })

  it("write は上書きする（継ぎ足さない）", () => {
    const chatSummary = createChatSummary("fictional-pack", root())

    chatSummary.write(SUMMARY)
    chatSummary.write("差し替えたあとの短い要約")

    expect(chatSummary.read()).toEqual({
      summary: "差し替えたあとの短い要約",
      delivered: true,
    })
  })

  it("パックごとに別のファイルになる", () => {
    const a = createChatSummary("pack-a", root())
    const b = createChatSummary("pack-b", root())

    a.write(SUMMARY)

    expect(a.read()?.summary).toBe(SUMMARY)
    expect(b.read()).toBeUndefined()
  })

  it("印の行が要約の本文に混ざらない（1行目だけが印）", () => {
    const chatSummary = createChatSummary("fictional-pack", root())

    chatSummary.write(SUMMARY)
    const path = join(root(), "fictional-pack.md")
    const raw = readFileSync(path, "utf8")

    expect(raw.split("\n")[0]).toBe("delivered")
    expect(chatSummary.read()?.summary).not.toContain("delivered")
    expect(chatSummary.read()?.summary).toBe(SUMMARY)
  })

  describe("markUndelivered / markDelivered", () => {
    it("markUndelivered で印が「未渡し」に戻る。本文は保つ", () => {
      const chatSummary = createChatSummary("fictional-pack", root())
      chatSummary.write(SUMMARY)

      chatSummary.markUndelivered()

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
    })

    it("markDelivered で印が「渡し済み」に戻る。本文は保つ", () => {
      const chatSummary = createChatSummary("fictional-pack", root())
      chatSummary.write(SUMMARY)
      chatSummary.markUndelivered()

      chatSummary.markDelivered()

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
    })

    it("写しが無いまま markUndelivered を呼んでも落ちない", () => {
      const chatSummary = createChatSummary("fictional-pack", root())

      expect(() => chatSummary.markUndelivered()).not.toThrow()
    })
  })

  describe("印が無い・読めないとき", () => {
    it("印の1行目が既定の文字列と違うファイルは「未渡し」扱いになる", () => {
      const chatSummary = createChatSummary("fictional-pack", root())
      chatSummary.write(SUMMARY)
      // 壊れた印（既知の2つの文字列のどちらでもない）に手で書き換える。
      const path = join(root(), "fictional-pack.md")
      const body = readFileSync(path, "utf8").split("\n").slice(1).join("\n")
      writeFileSync(path, `????\n${body}`)

      expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
    })
  })

  describe("8 KiB の上限", () => {
    it("超えたら古いほうの行から落ちる。行の途中では切らない", () => {
      const chatSummary = createChatSummary("fictional-pack", root())
      const lines = Array.from({ length: 200 }, (_, i) => `第${i}回のやり取りの短い要約行です。`)
      const summary = lines.join("\n")
      expect(byteLength(summary)).toBeGreaterThan(CHAT_SUMMARY_LIMIT_BYTES)

      chatSummary.write(summary)
      const record = chatSummary.read()
      expect(record).toBeDefined()
      const kept = record?.summary.split("\n") ?? []

      // 残ったのは末尾（新しいほう）の連続した行で、1件も途中で切られていない。
      expect(kept.length).toBeGreaterThan(0)
      expect(kept.length).toBeLessThan(lines.length)
      expect(lines.slice(lines.length - kept.length)).toEqual(kept)

      // ファイル全体（印の行を含む）が上限に収まっている。
      const path = join(root(), "fictional-pack.md")
      expect(readFileSync(path).byteLength).toBeLessThanOrEqual(CHAT_SUMMARY_LIMIT_BYTES)
    })

    it("要約が1行だけで8 KiBを超えるとき（改行が無い）も空にならない", () => {
      const chatSummary = createChatSummary("fictional-pack", root())
      const hugeSingleLine = "あ".repeat(6000) // 1文字3バイトなので 18,000 バイト超

      chatSummary.write(hugeSingleLine)
      const record = chatSummary.read()

      expect(record).toBeDefined()
      expect(record?.summary).not.toBe("")
      expect(record?.summary).toBe(hugeSingleLine)
    })
  })

  describe("パック名の検証", () => {
    it("isCharacterPackName を通らない名前では何も書かない", () => {
      const chatSummary = createChatSummary("../evil", root())

      chatSummary.write(SUMMARY)

      expect(chatSummary.read()).toBeUndefined()
      expect(existsSync(root())).toBe(false)
    })
  })

  it("テストは一時ディレクトリだけに書き、本物のホームには触らない", () => {
    const chatSummary = createChatSummary("fictional-pack", root())

    chatSummary.write(SUMMARY)

    expect(readdirSync(root())).toEqual(["fictional-pack.md"])
  })
})

describe("discardChatSummary", () => {
  it("そのパックの写しだけを消し、ほかのパックの写しは残す", () => {
    createChatSummary("fictional-2", root()).write(SUMMARY)
    createChatSummary("fictional", root()).write(SUMMARY)

    discardChatSummary("fictional-2", root())

    expect(createChatSummary("fictional-2", root()).read()).toBeUndefined()
    expect(createChatSummary("fictional", root()).read()?.summary).toBe(SUMMARY)
  })

  it("パックの名前として通らない値ではパスを組み立てず、何も消さない", () => {
    createChatSummary("fictional", root()).write(SUMMARY)

    discardChatSummary("../chat-summary/fictional", root())

    expect(readdirSync(root())).toEqual(["fictional.md"])
  })

  it("写しが無くても投げない", () => {
    expect(() => discardChatSummary("fictional", root())).not.toThrow()
  })
})
