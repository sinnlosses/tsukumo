import { beforeEach, describe, expect, it } from "vitest"

import {
  notesOf,
  unsentNotesAt,
  useReplyNotes,
} from "../../../src/browser/stores/reply-note-list.ts"
import type { ReplyTarget } from "../../../src/shared/session/reply-target.ts"

function targetAt(rowIndex: number): ReplyTarget {
  return {
    label: { component: "架空の案", row: `架空の案${String(rowIndex)}` },
    key: { reportToolUseId: "t1", componentId: "opts", rowIndex },
  }
}

function notesIn(sessionKey: string) {
  return notesOf(useReplyNotes.getState().notesBySession, sessionKey)
}

beforeEach(() => {
  useReplyNotes.setState(useReplyNotes.getInitialState(), true)
})

describe("useReplyNotes", () => {
  it("付箋を足すと未送信で並ぶ", () => {
    const note = useReplyNotes.getState().addNote("s1", targetAt(0), "この案で進めて。")
    expect(notesIn("s1")).toEqual([note])
    expect(note.state).toEqual({ kind: "unsent" })
    expect(note.body).toBe("この案で進めて。")
  })

  it("同じ所の未送信は二度足せず、既存の付箋を返す", () => {
    const first = useReplyNotes.getState().addNote("s1", targetAt(0), "一度目")
    const second = useReplyNotes.getState().addNote("s1", targetAt(0), "二度目")
    expect(second).toBe(first)
    expect(notesIn("s1")).toHaveLength(1)
  })

  it("rowIndex が違う案は別の付箋になる", () => {
    useReplyNotes.getState().addNote("s1", targetAt(0), "a")
    useReplyNotes.getState().addNote("s1", targetAt(1), "b")
    expect(notesIn("s1").map((note) => note.id)).toHaveLength(2)
    expect(new Set(notesIn("s1").map((note) => note.id)).size).toBe(2)
  })

  it("セッションの id ごとに分かれる", () => {
    useReplyNotes.getState().addNote("s1", targetAt(0), "a")
    useReplyNotes.getState().addNote("s2", targetAt(0), "b")
    expect(notesIn("s1")).toHaveLength(1)
    expect(notesIn("s2")).toHaveLength(1)
    expect(notesIn("s3")).toEqual([])
  })

  it("外すと消え、同じ所をまた足せる", () => {
    const note = useReplyNotes.getState().addNote("s1", targetAt(0), "a")
    useReplyNotes.getState().removeNote("s1", note.id)
    expect(notesIn("s1")).toEqual([])
    const again = useReplyNotes.getState().addNote("s1", targetAt(0), "a")
    expect(again.id).not.toBe(note.id)
    expect(notesIn("s1")).toHaveLength(1)
  })

  it("unsentNotesAt は送信済みの付箋を含めない", () => {
    const note = useReplyNotes.getState().addNote("s1", targetAt(0), "a")
    expect(unsentNotesAt(notesIn("s1"), note.target.key)).toEqual([note])
    const sent = { ...note, state: { kind: "sent", turn: 1 } as const }
    expect(unsentNotesAt([sent], note.target.key)).toEqual([])
  })
})
