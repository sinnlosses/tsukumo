import { describe, expect, it } from "vitest"

import {
  appendChatArchiveConclusion,
  appendChatArchiveEntry,
} from "../../../../src/server/chat/core/chat-archive-entry.ts"
import type {
  ChatArchive,
  ChatArchiveEntry,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/shared/chat/chat-memory-budget.ts"
import { NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"

const FICTIONAL_PROJECT = "架空プロジェクト"

/** 呼ばれた `append` の引数だけを覚える代役。 */
function recordingChatArchive(): {
  readonly archive: ChatArchive
  readonly calls: { readonly packName: string; readonly entry: ChatArchiveEntry }[]
} {
  const calls: { readonly packName: string; readonly entry: ChatArchiveEntry }[] = []
  return {
    archive: {
      ...NOOP_CHAT_ARCHIVE,
      append: (packName, entry) => {
        calls.push({ packName, entry })
      },
    },
    calls,
  }
}

describe("appendChatArchiveEntry", () => {
  it("雑談の依頼はそのままの文面で渡る（project は持たない）", () => {
    const { archive, calls } = recordingChatArchive()

    appendChatArchiveEntry(archive, "fictional-pack", "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text: "架空の依頼",
      images: [],
    })

    expect(calls).toEqual([
      {
        packName: "fictional-pack",
        entry: { mode: "chat", kind: "request", at: 1_000, text: "架空の依頼", images: undefined },
      },
    ])
  })

  it("雑談のセリフは表情つきで渡る", () => {
    const { archive, calls } = recordingChatArchive()

    appendChatArchiveEntry(archive, "fictional-pack", "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "speech",
      text: "架空のセリフ",
      expression: "proud",
    })

    expect(calls).toEqual([
      {
        packName: "fictional-pack",
        entry: {
          mode: "chat",
          kind: "speech",
          at: 1_000,
          text: "架空のセリフ",
          expression: "proud",
        },
      },
    ])
  })

  it("仕事の依頼は project を持ち、workExcerptChars 以内ならそのまま渡る", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)

    appendChatArchiveEntry(archive, "fictional-pack", "work", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text,
      images: [],
    })

    expect(calls).toEqual([
      {
        packName: "fictional-pack",
        entry: {
          mode: "work",
          kind: "request",
          at: 1_000,
          text,
          project: FICTIONAL_PROJECT,
          images: undefined,
        },
      },
    ])
  })

  it("仕事の依頼が workExcerptChars を1文字でも超えると、先頭で切って「…」を付ける", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 1)

    appendChatArchiveEntry(archive, "fictional-pack", "work", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text,
      images: [],
    })

    expect(calls[0]?.entry.text).toBe(`${"あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`)
  })

  it("切る境は UTF-16 のコード単位ではなくコードポイントで数える（サロゲートペアを割らない）", () => {
    const { archive, calls } = recordingChatArchive()
    // 各絵文字は UTF-16 で2コード単位だが、コードポイントとしては1文字。
    const text = "😀".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 1)

    appendChatArchiveEntry(archive, "fictional-pack", "work", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text,
      images: [],
    })

    expect(calls[0]?.entry.text).toBe(`${"😀".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`)
  })

  it("仕事のセリフは project を持ち、切らない", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 1)

    appendChatArchiveEntry(archive, "fictional-pack", "work", FICTIONAL_PROJECT, 1_000, {
      kind: "speech",
      text,
      expression: "default",
    })

    expect(calls).toEqual([
      {
        packName: "fictional-pack",
        entry: {
          mode: "work",
          kind: "speech",
          at: 1_000,
          text,
          project: FICTIONAL_PROJECT,
          expression: "default",
        },
      },
    ])
  })

  it("添えた画像は1枚以上あるときだけ枚数を持つ", () => {
    const { archive, calls } = recordingChatArchive()

    appendChatArchiveEntry(archive, "fictional-pack", "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text: "架空の依頼",
      images: [{ id: "fictional-id", thumbnail: "data:image/png;base64,AAAA" }],
    })

    expect(calls[0]?.entry).toMatchObject({ images: 1 })
  })

  it("packName が undefined のときは何も渡さない", () => {
    const { archive, calls } = recordingChatArchive()

    appendChatArchiveEntry(archive, undefined, "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text: "架空の依頼",
      images: [],
    })

    expect(calls).toEqual([])
  })

  it("依頼・セリフ以外のイベントは渡さない", () => {
    const { archive, calls } = recordingChatArchive()

    appendChatArchiveEntry(archive, "fictional-pack", "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "turn-finished",
      outcome: { kind: "completed" },
    })
    appendChatArchiveEntry(archive, "fictional-pack", "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "utterance",
      text: "本文はここに出ない",
    })

    expect(calls).toEqual([])
  })
})

describe("appendChatArchiveConclusion", () => {
  it("仕事の結論を1行渡す（workExcerptChars 以内ならそのまま）", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "架空の結論"

    appendChatArchiveConclusion(archive, "fictional-pack", FICTIONAL_PROJECT, 1_000, text)

    expect(calls).toEqual([
      {
        packName: "fictional-pack",
        entry: { mode: "work", kind: "conclusion", at: 1_000, text, project: FICTIONAL_PROJECT },
      },
    ])
  })

  it("workExcerptChars を超えると先頭で切って「…」を付ける", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "い".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 1)

    appendChatArchiveConclusion(archive, "fictional-pack", FICTIONAL_PROJECT, 1_000, text)

    expect(calls[0]?.entry.text).toBe(`${"い".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`)
  })

  it("packName が undefined のときは何も渡さない", () => {
    const { archive, calls } = recordingChatArchive()

    appendChatArchiveConclusion(archive, undefined, FICTIONAL_PROJECT, 1_000, "架空の結論")

    expect(calls).toEqual([])
  })
})
