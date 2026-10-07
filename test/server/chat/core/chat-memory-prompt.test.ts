import { describe, expect, it } from "vitest"

import type {
  ChatArchive,
  ChatReadbackLimits,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import {
  chatRecallEpisodeText,
  chatRecallListText,
  takeChatMemoryPromptParts,
  workMemoryPromptParts,
} from "../../../../src/server/chat/core/chat-memory-prompt.ts"
import type {
  ChatArchiveRecentEntry,
  ChatSummary,
  ChatSummaryRecord,
} from "../../../../src/server/session-driver/core/session-driver.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
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

const PACK_NAME = "fictional-pack"
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
    start: resume === undefined ? { kind: "new" } : { kind: "resume", sessionId: resume },
    chatSummary,
    chatArchive,
    packName: PACK_NAME,
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
      chatArchive,
      packName: PACK_NAME,
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

  it("前置きは雑談と同じ1つで、「雑談の」と言わず、recall で引けることを添える", () => {
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
    expect(work.join("\n")).toContain("`recall`")
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

describe("chatRecallListText", () => {
  it("当たった候補を、点の高い順のまま id・見出し・要旨で返す（逐語は入らない）", () => {
    const text = chatRecallListText({
      kind: "found",
      candidates: [
        { id: "2026-09-25-2", title: "散歩の話その2", gist: "また散歩に行った話。" },
        { id: "2026-09-25-1", title: "散歩の話", gist: "散歩に行った話。" },
      ],
    })

    expect(text.indexOf("2026-09-25-2")).toBeLessThan(text.indexOf("2026-09-25-1"))
    expect(text).toContain("散歩の話その2")
    expect(text).toContain("また散歩に行った話。")
    expect(text).not.toContain("利用者:")
    expect(text).not.toContain("###")
  })

  it("当たらなかったときは、会話の文面を1バイトも返さない", () => {
    const text = chatRecallListText({ kind: "not-found" })

    expect(text).not.toContain("利用者:")
    expect(text).toContain("索引に当たる候補が無かった")
  })

  it("そのターンで上限まで引いているときは、当たらなかったときと別の一言を返す", () => {
    const text = chatRecallListText({ kind: "exhausted" })

    expect(text).not.toBe(chatRecallListText({ kind: "not-found" }))
    expect(text).toContain("1ターンに2回")
  })
})

describe("chatRecallEpisodeText", () => {
  it("開いた1件の逐語を、話者の印と日付の見出しを付けて返す", () => {
    const text = chatRecallEpisodeText({ kind: "found", entries: RECENT, overflowed: false })

    expect(text).toContain("### 2026-09-20\n利用者: ただいま")
    expect(text).toContain("### 2026-09-21\nあなた: おかえり")
    // いまの話の続きではないことを前置きで断る。
    expect(text).toContain("続きではなく")
    expect(text).not.toContain("続きがあるが")
  })

  it("仕事の行は systemPrompt の逐語と同じ印で並ぶ", () => {
    const text = chatRecallEpisodeText({ kind: "found", entries: WORK_RECENT, overflowed: false })

    expect(text).toContain("[仕事: 架空プロジェクト] 利用者: 架空の依頼")
    expect(text).toContain("[仕事: 架空プロジェクト] したこと: 架空の結論")
  })

  it("overflowed のときは、逐語のあとに続きがあることだけを一言添える", () => {
    const text = chatRecallEpisodeText({ kind: "found", entries: RECENT, overflowed: true })

    expect(text).toContain("利用者: ただいま")
    expect(text).toContain("続きがあるが")
  })

  it("知らない id のときは、会話の文面を1バイトも返さない", () => {
    const text = chatRecallEpisodeText({ kind: "not-found" })

    expect(text).not.toContain("利用者:")
    expect(text).toContain("エピソードは無かった")
  })

  it("そのターンで上限まで開いているときは、知らない id のときと別の一言を返す", () => {
    const text = chatRecallEpisodeText({ kind: "exhausted" })

    expect(text).not.toBe(chatRecallEpisodeText({ kind: "not-found" }))
    expect(text).toContain("1ターンに2件")
  })
})
