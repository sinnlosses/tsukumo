import { describe, expect, it } from "bun:test"

import {
  chatRecallText,
  takeChatMemoryPromptParts,
} from "../../../../src/server/chat/core/chat-memory-prompt.ts"
import {
  type ChatArchive,
  type ChatArchiveRecentEntry,
  type ChatReadbackLimits,
  type ChatSummary,
  type ChatSummaryRecord,
} from "../../../../src/server/session-driver/core/session-driver.ts"

// フィクスチャは手で書いた架空の要約・会話だけ（実物の会話は使わない。
// docs/coding-standards.md「会話内容の扱い」）。
const SUMMARY = "利用者と最近読んだ本の話をした。次は続きの巻の感想を聞きたがっていた。"
const RECENT: readonly ChatArchiveRecentEntry[] = [
  { speaker: "user", text: "ただいま", date: "2026-09-20" },
  { speaker: "character", text: "おかえり", date: "2026-09-21" },
]

const PACK_NAME = "fictional-pack"
const LIMITS: ChatReadbackLimits = { recentBytes: 65_536, keptBytes: 8_192 }

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
function fakeChatArchive(
  entries: readonly ChatArchiveRecentEntry[],
  kept: readonly ChatArchiveRecentEntry[] = [],
): ChatArchive & {
  readonly readRecentArgs: () => readonly { packName: string; limits: ChatReadbackLimits }[]
} {
  const calls: { packName: string; limits: ChatReadbackLimits }[] = []
  return {
    append: () => {},
    keep: () => {},
    finishTurn: () => {},
    writeIndex: () => {},
    recall: () => ({ kind: "not-found" }),
    readRecent: (packName, limits) => {
      calls.push({ packName, limits })
      return { kept, recent: entries }
    },
    readRecentArgs: () => calls,
  }
}

/**
 * 既定の呼び出し（写しも逐語もある状態）。**`resume` は呼び出し側の書きやすさのための
 * 短縮形**（`undefined` なら新規、文字列なら続きのセッションID）で、ここで
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
      { speaker: "user", text: "きょうは晴れの話をした", date: "2026-09-20" },
      { speaker: "character", text: "そうだねと返した", date: "2026-09-20" },
      { speaker: "user", text: "つぎの日にまた話しかけた", date: "2026-09-21" },
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

  it("1日ぶんしか無いときは見出しが1つだけで、二重にならない", () => {
    const oneDay = take(
      undefined,
      fakeChatSummary(undefined),
      fakeChatArchive([
        { speaker: "user", text: "ただいま", date: "2026-09-21" },
        { speaker: "character", text: "おかえり", date: "2026-09-21" },
      ]),
    )
    const text = oneDay[0] ?? ""

    expect(countOccurrences(text, "### 2026-09-21")).toBe(1)
    expect(text).not.toContain("範囲:")
    expect(text).not.toContain("〜")
  })

  it("表情も画像の枚数も載らない（口が渡さないので、文面と話者の別だけが並ぶ）", () => {
    const parts = take(undefined, fakeChatSummary(undefined), fakeChatArchive(RECENT))

    expect(parts[0]).toContain("利用者: ただいま")
    expect(parts[0]).toContain("あなた: おかえり")
  })

  it("旗の付いたやり取りは、要約と直近の間に別の節として載る", () => {
    const kept: readonly ChatArchiveRecentEntry[] = [
      { speaker: "user", text: "残したい古い話", date: "2026-08-01" },
    ]

    const parts = take(
      undefined,
      fakeChatSummary({ summary: SUMMARY, delivered: false }),
      fakeChatArchive(RECENT, kept),
    )

    expect(parts).toHaveLength(3)
    expect(parts[0]).toContain(SUMMARY)
    expect(parts[1]).toContain("残したい古い話")
    expect(parts[2]).toContain("ただいま")
    // 節が分かれているので、旗のぶんに直近の文面は混ざらない。
    expect(parts[1]).not.toContain("ただいま")
  })

  it("旗の付いたやり取りには、時系列が続いていないことを断る前置きが付く", () => {
    const parts = take(
      undefined,
      fakeChatSummary(undefined),
      fakeChatArchive(RECENT, [{ speaker: "user", text: "残したい古い話", date: "2026-08-01" }]),
    )
    const keptPart = parts[0] ?? ""

    expect(keptPart).toContain("## 残すと決めた雑談")
    expect(keptPart).toContain("残っていない会話がある")
    // 話者の印と日付の見出しは直近と同じ形。
    expect(keptPart).toContain("### 2026-08-01")
    expect(keptPart).toContain("利用者: 残したい古い話")
  })

  it("旗の付いたやり取りが1件も無いときは、その節そのものが出ない", () => {
    const parts = take(undefined, fakeChatSummary(undefined), fakeChatArchive(RECENT))

    expect(parts).toHaveLength(1)
    expect(parts.join("\n")).not.toContain("## 残すと決めた雑談")
  })

  it("印の行が systemPrompt に混ざらない", () => {
    const chatSummary = fakeChatSummary({ summary: SUMMARY, delivered: false })

    const parts = take(undefined, chatSummary, fakeChatArchive(RECENT))

    expect(parts.join("\n")).not.toContain("delivered")
    expect(parts.join("\n")).not.toContain("undelivered")
  })
})

describe("chatRecallText", () => {
  it("当たった日の逐語を、話者の印と日付の見出しを付けて返す", () => {
    const text = chatRecallText({ kind: "found", entries: RECENT })

    expect(text).toContain("### 2026-09-20\n利用者: ただいま")
    expect(text).toContain("### 2026-09-21\nあなた: おかえり")
    // いまの話の続きではないことを前置きで断る。
    expect(text).toContain("続きではなく")
  })

  it("当たらなかったときは、会話の文面を1バイトも返さない", () => {
    const text = chatRecallText({ kind: "not-found" })

    expect(text).not.toContain("利用者:")
    expect(text).not.toContain("###")
    expect(text).toContain("索引に当たる日が無かった")
  })

  it("そのターンで既に引いているときは、当たらなかったときと別の一言を返す", () => {
    const text = chatRecallText({ kind: "already-recalled" })

    expect(text).not.toBe(chatRecallText({ kind: "not-found" }))
    expect(text).toContain("1ターンに1回")
  })
})
