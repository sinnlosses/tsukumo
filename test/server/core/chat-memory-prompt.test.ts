import { describe, expect, it } from "bun:test"

import { takeChatMemoryPromptParts } from "../../../src/server/core/chat-memory-prompt.ts"
import {
  type ChatArchive,
  type ChatArchiveRecentEntry,
  type ChatSummary,
  type ChatSummaryRecord,
} from "../../../src/server/core/session-driver.ts"

// フィクスチャは手で書いた架空の要約・会話だけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const SUMMARY = "利用者と最近読んだ本の話をした。次は続きの巻の感想を聞きたがっていた。"
const RECENT: readonly ChatArchiveRecentEntry[] = [
  { speaker: "user", text: "ただいま", date: "2026-09-20" },
  { speaker: "character", text: "おかえり", date: "2026-09-21" },
]

const PACK_NAME = "fictional-pack"
const LIMIT_BYTES = 16_384

/** メモリ上の `ChatSummary`（テスト用）。呼ばれた回数も数える。 */
function fakeChatSummary(initial: ChatSummaryRecord | undefined): ChatSummary & {
  readonly markDeliveredCalls: () => number
} {
  let record = initial
  let markDeliveredCount = 0
  return {
    read: () => record,
    write: (summary) => {
      record = { summary, delivered: true }
    },
    markUndelivered: () => {
      record = { summary: record?.summary ?? "", delivered: false }
    },
    markDelivered: () => {
      markDeliveredCount += 1
      record = { summary: record?.summary ?? "", delivered: true }
    },
    markDeliveredCalls: () => markDeliveredCount,
  }
}

/** メモリ上の `ChatArchive`（テスト用）。読み戻しに渡された引数も覚える。 */
function fakeChatArchive(entries: readonly ChatArchiveRecentEntry[]): ChatArchive & {
  readonly readRecentArgs: () => readonly { packName: string; limitBytes: number }[]
} {
  const calls: { packName: string; limitBytes: number }[] = []
  return {
    append: () => {},
    readRecent: (packName, limitBytes) => {
      calls.push({ packName, limitBytes })
      return entries
    },
    readRecentArgs: () => calls,
  }
}

/** 既定の呼び出し（写しも逐語もある状態）。 */
function take(
  resume: string | undefined,
  chatSummary: ChatSummary | undefined,
  chatArchive: ChatArchive,
): readonly string[] {
  return takeChatMemoryPromptParts({
    resume,
    chatSummary,
    chatArchive,
    packName: PACK_NAME,
    recentLimitBytes: LIMIT_BYTES,
  })
}

describe("takeChatMemoryPromptParts", () => {
  it("新規の雑談（resume が undefined）では要約も逐語も載る。載せたら印が「渡し済み」に戻る", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })
    const chatArchive = fakeChatArchive(RECENT)

    const parts = take(undefined, chatSummary, chatArchive)

    expect(parts.join("\n")).toContain(SUMMARY)
    expect(parts.join("\n")).toContain("ただいま")
    expect(parts.join("\n")).toContain("おかえり")
    expect(chatSummary.markDeliveredCalls()).toBe(1)
    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
  })

  it("要約が先、直近の逐語が後（古い→新しいの順）", () => {
    const parts = take(
      undefined,
      fakeChatSummary({ summary: SUMMARY, delivered: false }),
      fakeChatArchive(RECENT),
    )

    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain(SUMMARY)
    expect(parts[1]).toContain("ただいま")
  })

  it("resume のときは逐語も要約も載らない（写しの印が「渡し済み」）。アーカイブも読まない", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: true })
    const chatArchive = fakeChatArchive(RECENT)

    const parts = take("session-1", chatSummary, chatArchive)

    expect(parts).toEqual([])
    expect(chatSummary.markDeliveredCalls()).toBe(0)
    expect(chatArchive.readRecentArgs()).toEqual([])
  })

  it("写しがまだ無くても逐語は載る（印は「渡し済み」に戻る）", () => {
    const chatSummary = fakeChatSummary(undefined)
    const chatArchive = fakeChatArchive(RECENT)

    const parts = take(undefined, chatSummary, chatArchive)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toContain("ただいま")
    expect(parts[0]).not.toContain(SUMMARY)
    expect(chatSummary.markDeliveredCalls()).toBe(1)
  })

  it("写しが無い（印も無い）ときは「未渡し」扱いで、resume でも逐語が載る", () => {
    const chatSummary = fakeChatSummary(undefined)

    const parts = take("session-1", chatSummary, fakeChatArchive(RECENT))

    expect(parts).toHaveLength(1)
    expect(parts[0]).toContain("ただいま")
  })

  it("逐語が1件も無くても要約は載る", () => {
    const parts = take(
      undefined,
      fakeChatSummary({ summary: SUMMARY, delivered: false }),
      fakeChatArchive([]),
    )

    expect(parts).toHaveLength(1)
    expect(parts[0]).toContain(SUMMARY)
  })

  it("`/clear` を見たあとの resume（印が「未渡し」）では載る", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    const parts = take("session-1", chatSummary, fakeChatArchive(RECENT))

    expect(parts.join("\n")).toContain(SUMMARY)
    expect(parts.join("\n")).toContain("ただいま")
    expect(chatSummary.markDeliveredCalls()).toBe(1)
  })

  it("載せたあとの resume では載らない（新規で載せた直後に起こし直した場合）", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })
    // 新規の雑談で1回載る。
    take(undefined, chatSummary, fakeChatArchive(RECENT))

    // 同じセッションを resume で起こし直す。
    const parts = take("session-1", chatSummary, fakeChatArchive(RECENT))

    expect(parts).toEqual([])
    expect(chatSummary.markDeliveredCalls()).toBe(1)
  })

  it("仕事のとき（chatSummary が undefined）は resume の値によらず載らない。読みも書きも起きない", () => {
    const chatArchive = fakeChatArchive(RECENT)

    expect(take(undefined, undefined, chatArchive)).toEqual([])
    expect(take("session-1", undefined, chatArchive)).toEqual([])
    expect(chatArchive.readRecentArgs()).toEqual([])
  })

  it("写しも逐語も無いときは何も載らず、印も書き換えない", () => {
    const chatSummary = fakeChatSummary(undefined)

    expect(take(undefined, chatSummary, fakeChatArchive([]))).toEqual([])
    expect(chatSummary.markDeliveredCalls()).toBe(0)
  })

  it("読み戻しにはパックの名前と渡された上限がそのまま渡る", () => {
    const chatArchive = fakeChatArchive(RECENT)

    take(undefined, fakeChatSummary(undefined), chatArchive)

    expect(chatArchive.readRecentArgs()).toEqual([{ packName: PACK_NAME, limitBytes: LIMIT_BYTES }])
  })

  it("逐語には窓の最初と最後の日付が1行添う（同じ日なら1つだけ）", () => {
    const spanned = take(undefined, fakeChatSummary(undefined), fakeChatArchive(RECENT))
    expect(spanned[0]).toContain("2026-09-20 〜 2026-09-21")

    const sameDay = take(
      undefined,
      fakeChatSummary(undefined),
      fakeChatArchive([{ speaker: "user", text: "ただいま", date: "2026-09-21" }]),
    )
    expect(sameDay[0]).toContain("2026-09-21")
    expect(sameDay[0]).not.toContain("〜")
  })

  it("表情も画像の枚数も載らない（口が渡さないので、文面と話者の別だけが並ぶ）", () => {
    const parts = take(undefined, fakeChatSummary(undefined), fakeChatArchive(RECENT))

    expect(parts[0]).toContain("利用者: ただいま")
    expect(parts[0]).toContain("あなた: おかえり")
  })

  it("印の行が systemPrompt に混ざらない", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    const parts = take(undefined, chatSummary, fakeChatArchive(RECENT))

    expect(parts.join("\n")).not.toContain("delivered")
    expect(parts.join("\n")).not.toContain("undelivered")
  })
})
