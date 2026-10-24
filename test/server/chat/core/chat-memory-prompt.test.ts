import { describe, expect, it } from "vitest"

import type {
  ChatArchive,
  ChatArchiveRecentEntry,
  ChatReadbackLimits,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  takeChatMemoryPromptParts,
  workMemoryPromptParts,
} from "../../../../src/server/chat/core/chat-memory-prompt.ts"
import type {
  ChatSummary,
  ChatSummaryRecord,
} from "../../../../src/server/chat/core/chat-memory.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { inMemoryChatSummary, NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"

const SUMMARY = "利用者と最近読んだ本の話をした。次は続きの巻の感想を聞きたがっていた。"
const RECENT: readonly ChatArchiveRecentEntry[] = [
  { kind: "request", origin: { mode: "chat" }, text: "ただいま", date: "2026-09-20" },
  { kind: "speech", origin: { mode: "chat" }, text: "おかえり", date: "2026-09-21" },
]

const WORK_RECENT: readonly ChatArchiveRecentEntry[] = [
  {
    kind: "request",
    origin: { mode: "work", project: "架空プロジェクト" },
    text: "架空の依頼",
    date: "2026-09-21",
  },
  {
    kind: "conclusion",
    origin: { mode: "work", project: "架空プロジェクト" },
    text: "架空の結論",
    date: "2026-09-21",
  },
]

const PACK_NAME = characterPackName("fictional-pack")
const LIMITS: ChatReadbackLimits = { recentBytes: CHAT_MEMORY_BUDGET.recentBytes }

/** メモリ上の `ChatSummary`（テスト用）。届けた印を付けた回数も数える。 */
function fakeChatSummary(initial: ChatSummaryRecord | undefined): ChatSummary & {
  readonly markDeliveredCalls: () => number
} {
  const summary = inMemoryChatSummary(initial)
  let markDeliveredCount = 0
  return {
    ...summary,
    markDelivered: () => {
      markDeliveredCount += 1
      summary.markDelivered()
    },
    markDeliveredCalls: () => markDeliveredCount,
  }
}

/** 読み戻しで `entries` を返す `ChatArchive`（テスト用）。読み戻しに渡された引数も覚える。 */
function fakeChatArchive(entries: readonly ChatArchiveRecentEntry[]): ChatArchive & {
  readonly readRecentArgs: () => readonly { packName: string; limits: ChatReadbackLimits }[]
} {
  const calls: { packName: string; limits: ChatReadbackLimits }[] = []
  return {
    ...NOOP_CHAT_ARCHIVE,
    readRecent: (packName, limits) => {
      calls.push({ packName, limits })
      return entries
    },
    readRecentArgs: () => calls,
  }
}

/**
 * 既定の呼び出し（写しも逐語もある状態）。`resume` は呼び出し側の書きやすさのための
 * 短縮形（`undefined` なら新規、文字列なら続きのセッションID）で、ここで
 * `SessionStart` へ畳んでから渡す。
 */
function take(
  resume: string | undefined,
  chatSummary: ChatSummary,
  chatArchive: ChatArchive,
): readonly string[] {
  return takeChatMemoryPromptParts({
    resumed: resume !== undefined,
    chatSummary,
    readRecent: (limits) => chatArchive.readRecent(PACK_NAME, limits),
    readbackLimits: LIMITS,
  })
}

/** `text` の中に `needle` が何回出てくるか（重ならない出現だけを数える）。 */
function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe("takeChatMemoryPromptParts", () => {
  it("新規の雑談（resume が undefined）では要約・直近の逐語（古い→新しい）の順で載る。載せたら印が「渡し済み」に戻る", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })
    const chatArchive = fakeChatArchive(RECENT)

    const parts = take(undefined, chatSummary, chatArchive)

    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain(SUMMARY)
    expect(parts[1]).toContain("ただいま")
    expect(parts[1]).toContain("おかえり")
    expect(parts[1]?.indexOf("ただいま")).toBeLessThan(parts[1]?.indexOf("おかえり") ?? -1)
    expect(chatSummary.markDeliveredCalls()).toBe(1)
    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
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

  it("写しも逐語も無いときは何も載らず、印も書き換えない", () => {
    const chatSummary = fakeChatSummary(undefined)

    expect(take(undefined, chatSummary, fakeChatArchive([]))).toEqual([])
    expect(chatSummary.markDeliveredCalls()).toBe(0)
  })

  it("読み戻しにはパックの名前と渡された上限がそのまま渡る", () => {
    const chatArchive = fakeChatArchive(RECENT)

    take(undefined, fakeChatSummary(undefined), chatArchive)

    expect(chatArchive.readRecentArgs()).toEqual([{ packName: PACK_NAME, limits: LIMITS }])
  })

  it("2日ぶんの逐語を渡すと、日付ごとに見出しが1つずつ入る（並べ替えない）", () => {
    const twoDays: readonly ChatArchiveRecentEntry[] = [
      {
        kind: "request",
        origin: { mode: "chat" },
        text: "きょうは晴れの話をした",
        date: "2026-09-20",
      },
      { kind: "speech", origin: { mode: "chat" }, text: "そうだねと返した", date: "2026-09-20" },
      {
        kind: "request",
        origin: { mode: "chat" },
        text: "つぎの日にまた話しかけた",
        date: "2026-09-21",
      },
    ]

    const parts = take(undefined, fakeChatSummary(undefined), fakeChatArchive(twoDays))
    const text = parts[0] ?? ""

    expect(countOccurrences(text, "### 2026-09-20")).toBe(1)
    expect(countOccurrences(text, "### 2026-09-21")).toBe(1)
    // 見出しのあとに、その日の発言が届いた順のまま続く。
    expect(text.indexOf("### 2026-09-20")).toBeLessThan(text.indexOf("きょうは晴れの話をした"))
    expect(text.indexOf("そうだねと返した")).toBeLessThan(text.indexOf("### 2026-09-21"))
    expect(text.indexOf("### 2026-09-21")).toBeLessThan(text.indexOf("つぎの日にまた話しかけた"))
  })
})

describe("workMemoryPromptParts", () => {
  function takeWork(chatSummary: ChatSummary, chatArchive: ChatArchive): readonly string[] {
    return workMemoryPromptParts({
      chatSummary,
      readRecent: (limits) => chatArchive.readRecent(PACK_NAME, limits),
      readbackLimits: { recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes },
    })
  }

  it("印が「渡し済み」でも、あらすじ → 直近の逐語の順で載り、印は書き換えない", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: true })

    const parts = takeWork(chatSummary, fakeChatArchive(RECENT))

    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain(SUMMARY)
    expect(parts[1]).toContain("利用者: ただいま")
    expect(chatSummary.markDeliveredCalls()).toBe(0)
    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: true })
  })

  it("印が「未渡し」でも印を書き換えない（/clear した雑談の記憶を奪わない）", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    takeWork(chatSummary, fakeChatArchive(RECENT))

    expect(chatSummary.read()).toEqual({ summary: SUMMARY, delivered: false })
  })

  it("前置きは雑談と同じ1つで、「雑談の」と言わない", () => {
    const work = takeWork(
      fakeChatSummary({ summary: SUMMARY, delivered: false }),
      fakeChatArchive(RECENT),
    )
    const chat = take(
      undefined,
      fakeChatSummary({ summary: SUMMARY, delivered: false }),
      fakeChatArchive(RECENT),
    )

    expect(work).toEqual(chat)
    expect(work.join("\n")).not.toContain("雑談の")
  })

  it("読み戻しには渡された上限がそのまま渡る", () => {
    const chatArchive = fakeChatArchive([])

    takeWork(fakeChatSummary(undefined), chatArchive)

    expect(chatArchive.readRecentArgs()).toEqual([
      { packName: PACK_NAME, limits: { recentBytes: CHAT_MEMORY_BUDGET.workRecentBytes } },
    ])
  })

  it("仕事の行には印とプロジェクトの名前が付き、結論の行は「したこと」になる", () => {
    const parts = takeWork(fakeChatSummary(undefined), fakeChatArchive(WORK_RECENT))

    expect(parts[0]).toContain("[仕事: 架空プロジェクト] 利用者: 架空の依頼")
    expect(parts[0]).toContain("[仕事: 架空プロジェクト] したこと: 架空の結論")
  })

  it("あらすじも逐語も無いときは何も載らない", () => {
    expect(takeWork(fakeChatSummary(undefined), fakeChatArchive([]))).toEqual([])
  })
})
