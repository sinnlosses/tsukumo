import { describe, expect, it } from "vitest"

import {
  appendChatArchiveConclusion,
  appendChatArchiveEntry,
} from "../../../../src/server/chat/core/chat-archive-entry.ts"
import type {
  ChatArchive,
  ChatArchiveEntry,
  ChatArchiveImage,
  ChatArchiveImageWriteResult,
} from "../../../../src/server/chat/core/chat-archive-port.ts"
import { CHAT_MEMORY_BUDGET } from "../../../../src/server/chat/core/chat-memory-budget.ts"
import type { CharacterPackName } from "../../../../src/shared/character-pack/character.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"
import { characterPackName } from "../../../fixture/character.ts"
import { NOOP_CHAT_ARCHIVE } from "../../../fixture/chat.ts"

const PACK = characterPackName("fictional-pack")

const FICTIONAL_PROJECT = "架空プロジェクト"

/** 棚が空の画像の口を渡して1件渡す。 */
function appendEntryWithoutShelf(
  archive: ChatArchive,
  packName: CharacterPackName,
  mode: "chat" | "work",
  project: string,
  at: number,
  event: SessionEvent,
): Promise<void> | undefined {
  return appendChatArchiveEntry(archive, packName, mode, project, at, event, {
    find: () => undefined,
    reportFailure: () => {},
  })
}

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

    appendEntryWithoutShelf(archive, PACK, "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text: "架空の依頼",
      images: [],
    })

    expect(calls).toEqual([
      {
        packName: PACK,
        entry: {
          mode: "chat",
          kind: "request",
          at: 1_000,
          text: "架空の依頼",
          images: undefined,
          imageFiles: undefined,
        },
      },
    ])
  })

  it("雑談のセリフは表情つきで渡る", () => {
    const { archive, calls } = recordingChatArchive()

    appendEntryWithoutShelf(archive, PACK, "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "speech",
      text: "架空のセリフ",
      expression: "proud",
    })

    expect(calls).toEqual([
      {
        packName: PACK,
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

    appendEntryWithoutShelf(archive, PACK, "work", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text,
      images: [],
    })

    expect(calls).toEqual([
      {
        packName: PACK,
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

    appendEntryWithoutShelf(archive, PACK, "work", FICTIONAL_PROJECT, 1_000, {
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

    appendEntryWithoutShelf(archive, PACK, "work", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text,
      images: [],
    })

    expect(calls[0]?.entry.text).toBe(`${"😀".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`)
  })

  it("仕事のセリフは project を持ち、切らない", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "あ".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 1)

    appendEntryWithoutShelf(archive, PACK, "work", FICTIONAL_PROJECT, 1_000, {
      kind: "speech",
      text,
      expression: "default",
    })

    expect(calls).toEqual([
      {
        packName: PACK,
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

  it("添えた画像は1枚以上あるときだけ枚数を持つ", async () => {
    const { archive, calls } = recordingChatArchive()

    await appendEntryWithoutShelf(archive, PACK, "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "request",
      text: "架空の依頼",
      images: [{ id: "fictional-id", thumbnail: "data:image/png;base64,AAAA" }],
    })

    expect(calls[0]?.entry).toMatchObject({ images: 1 })
  })

  it("依頼・セリフ以外のイベントは渡さない", () => {
    const { archive, calls } = recordingChatArchive()

    appendEntryWithoutShelf(archive, PACK, "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "turn-finished",
      outcome: { kind: "completed" },
    })
    appendEntryWithoutShelf(archive, PACK, "chat", FICTIONAL_PROJECT, 1_000, {
      kind: "utterance",
      text: "本文はここに出ない",
    })

    expect(calls).toEqual([])
  })
})

describe("appendChatArchiveEntry の画像", () => {
  /** 合成のバイト列（3バイト）の data URL。実物の画像は使わない。 */
  const SYNTHETIC_DATA_URL = "data:image/png;base64,AQID"
  const WRITE_ERROR = new Error("架空の書き損じ")

  /** `writeImage` を覚え、id が `failing` のものだけ書けなかったと返す代役。 */
  function imageRecordingArchive(failing: ReadonlySet<string>) {
    const { archive, calls } = recordingChatArchive()
    const writes: { readonly packName: string; readonly id: string; readonly dataUrl: string }[] =
      []
    return {
      archive: {
        ...archive,
        writeImage: (
          packName: string,
          image: ChatArchiveImage,
        ): Promise<ChatArchiveImageWriteResult> => {
          writes.push({ packName, id: image.id, dataUrl: image.dataUrl })
          return Promise.resolve(
            failing.has(image.id)
              ? { kind: "failed", error: WRITE_ERROR }
              : { kind: "written", fileName: `${image.id}.png` },
          )
        },
      } satisfies ChatArchive,
      calls,
      writes,
    }
  }

  function shelfOf(ids: readonly string[]) {
    const failures: unknown[] = []
    return {
      source: {
        find: (id: string) => (ids.includes(id) ? SYNTHETIC_DATA_URL : undefined),
        reportFailure: (error: unknown) => {
          failures.push(error)
        },
      },
      failures,
    }
  }

  function requestWith(ids: readonly string[]): SessionEvent {
    return {
      kind: "request",
      text: "架空の依頼",
      images: ids.map((id) => ({ id, thumbnail: SYNTHETIC_DATA_URL })),
    }
  }

  it("雑談の依頼は、棚の原寸を書いてから、書けたファイル名を行に載せる", async () => {
    const { archive, calls, writes } = imageRecordingArchive(new Set())
    const { source, failures } = shelfOf(["id-1", "id-2"])

    await appendChatArchiveEntry(
      archive,
      PACK,
      "chat",
      FICTIONAL_PROJECT,
      1_000,
      requestWith(["id-1", "id-2"]),
      source,
    )

    expect(writes).toEqual([
      { packName: PACK, id: "id-1", dataUrl: SYNTHETIC_DATA_URL },
      { packName: PACK, id: "id-2", dataUrl: SYNTHETIC_DATA_URL },
    ])
    expect(calls[0]?.entry).toMatchObject({ images: 2, imageFiles: ["id-1.png", "id-2.png"] })
    expect(failures).toEqual([])
  })

  it("仕事の依頼は画像を書かず、枚数だけを残す", () => {
    const { archive, calls, writes } = imageRecordingArchive(new Set())
    const { source } = shelfOf(["id-1"])

    const done = appendChatArchiveEntry(
      archive,
      PACK,
      "work",
      FICTIONAL_PROJECT,
      1_000,
      requestWith(["id-1"]),
      source,
    )

    expect(done).toBeUndefined()
    expect(writes).toEqual([])
    expect(calls[0]?.entry).toMatchObject({ images: 1 })
    expect(calls[0]?.entry).not.toHaveProperty("imageFiles")
  })

  it("書けなかった1枚と棚から落ちていた1枚は行に載せず、知らせたうえで行は書く", async () => {
    const { archive, calls } = imageRecordingArchive(new Set(["id-failing"]))
    const { source, failures } = shelfOf(["id-ok", "id-failing"])

    await appendChatArchiveEntry(
      archive,
      PACK,
      "chat",
      FICTIONAL_PROJECT,
      1_000,
      requestWith(["id-ok", "id-failing", "id-gone"]),
      source,
    )

    expect(calls[0]?.entry).toMatchObject({ images: 3, imageFiles: ["id-ok.png"] })
    expect(failures).toEqual([WRITE_ERROR, undefined])
  })

  it("1枚も書けなければ imageFiles を持たない", async () => {
    const { archive, calls } = imageRecordingArchive(new Set(["id-1"]))
    const { source } = shelfOf(["id-1"])

    await appendChatArchiveEntry(
      archive,
      PACK,
      "chat",
      FICTIONAL_PROJECT,
      1_000,
      requestWith(["id-1"]),
      source,
    )

    expect(calls[0]?.entry).toMatchObject({ imageFiles: undefined })
  })

  it("画像の書き出しが解けないあいだは Promise を返して行を足さず、解けてから足す", async () => {
    const { archive, calls } = recordingChatArchive()
    const release: { done: (result: ChatArchiveImageWriteResult) => void } = {
      done: () => {},
    }
    const pending = new Promise<ChatArchiveImageWriteResult>((resolve) => {
      release.done = resolve
    })
    const { source } = shelfOf(["id-1"])

    const done = appendChatArchiveEntry(
      { ...archive, writeImage: () => pending },
      PACK,
      "chat",
      FICTIONAL_PROJECT,
      1_000,
      requestWith(["id-1"]),
      source,
    )

    expect(done).toBeInstanceOf(Promise)
    expect(calls).toEqual([])

    release.done({ kind: "written", fileName: "id-1.png" })
    await done

    expect(calls[0]?.entry).toMatchObject({ imageFiles: ["id-1.png"] })
  })
})

describe("appendChatArchiveConclusion", () => {
  it("仕事の結論を1行渡す（workExcerptChars 以内ならそのまま）", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "架空の結論"

    appendChatArchiveConclusion(archive, PACK, FICTIONAL_PROJECT, 1_000, text)

    expect(calls).toEqual([
      {
        packName: PACK,
        entry: { mode: "work", kind: "conclusion", at: 1_000, text, project: FICTIONAL_PROJECT },
      },
    ])
  })

  it("workExcerptChars を超えると先頭で切って「…」を付ける", () => {
    const { archive, calls } = recordingChatArchive()
    const text = "い".repeat(CHAT_MEMORY_BUDGET.workExcerptChars + 1)

    appendChatArchiveConclusion(archive, PACK, FICTIONAL_PROJECT, 1_000, text)

    expect(calls[0]?.entry.text).toBe(`${"い".repeat(CHAT_MEMORY_BUDGET.workExcerptChars)}…`)
  })
})
