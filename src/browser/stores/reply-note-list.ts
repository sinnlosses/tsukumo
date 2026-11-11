// 「頼む」の付箋をセッションの id ごとにタブのメモリだけで持つ。
// 付箋の中身は利用者の書いた字なので、永続化・サーバへの送り・ログへの出力をしない。

import { create } from "zustand"

import {
  sameReplyKey,
  type ReplyTarget,
  type ReplyTargetKey,
} from "../../shared/session/reply-target.ts"
import { useSession } from "./session.ts"

/** セッションの id がまだ無い（`starting`）ときの鍵。 */
const STARTING_SESSION_KEY = "starting"

export type ReplyNoteState =
  | { readonly kind: "unsent" }
  | { readonly kind: "sent"; readonly turn: number }

export type ReplyNote = {
  readonly id: string
  readonly target: ReplyTarget
  readonly body: string
  readonly state: ReplyNoteState
}

type ReplyNotesState = {
  readonly notesBySession: Readonly<Record<string, readonly ReplyNote[]>>
  readonly nextId: number
  /** 同じ `target.key` の未送信の付箋が既にあれば足さず、その付箋を返す。 */
  readonly addNote: (sessionKey: string, target: ReplyTarget, body: string) => ReplyNote
  readonly removeNote: (sessionKey: string, id: string) => void
  /** 未送信の並びの中で動かす。`toIndex` は範囲の端に収める。送った付箋の位置は変えない。 */
  readonly moveNote: (sessionKey: string, id: string, toIndex: number) => void
  /** 組の付箋を「送った」にして、送ったやり取りの番号を書く。 */
  readonly markSent: (sessionKey: string, ids: readonly string[], turn: number) => void
}

const NO_NOTES: readonly ReplyNote[] = []

export const useReplyNotes = create<ReplyNotesState>()((set, get) => ({
  notesBySession: {},
  nextId: 1,
  addNote: (sessionKey, target, body) => {
    const [existing] = unsentNotesAt(notesOf(get().notesBySession, sessionKey), target.key)
    if (existing !== undefined) return existing
    const note: ReplyNote = {
      id: `note-${String(get().nextId)}`,
      target,
      body,
      state: { kind: "unsent" },
    }
    set((state) => ({
      nextId: state.nextId + 1,
      notesBySession: {
        ...state.notesBySession,
        [sessionKey]: [...(state.notesBySession[sessionKey] ?? NO_NOTES), note],
      },
    }))
    return note
  },
  removeNote: (sessionKey, id) => {
    set((state) => ({
      notesBySession: {
        ...state.notesBySession,
        [sessionKey]: (state.notesBySession[sessionKey] ?? NO_NOTES).filter(
          (note) => note.id !== id,
        ),
      },
    }))
  },
  moveNote: (sessionKey, id, toIndex) => {
    set((state) => {
      const notes = state.notesBySession[sessionKey] ?? NO_NOTES
      const moving = notes.find((note) => note.id === id)
      if (moving?.state.kind !== "unsent") return state
      const unsent = notes.filter((note) => note.state.kind === "unsent")
      const rest = unsent.filter((note) => note.id !== id)
      const to = Math.max(0, Math.min(toIndex, rest.length))
      const reordered = [...rest.slice(0, to), moving, ...rest.slice(to)]
      let cursor = 0
      return {
        notesBySession: {
          ...state.notesBySession,
          [sessionKey]: notes.map((note) =>
            note.state.kind === "unsent" ? (reordered[cursor++] ?? note) : note,
          ),
        },
      }
    })
  },
  markSent: (sessionKey, ids, turn) => {
    set((state) => ({
      notesBySession: {
        ...state.notesBySession,
        [sessionKey]: (state.notesBySession[sessionKey] ?? NO_NOTES).map((note) =>
          ids.includes(note.id) ? { ...note, state: { kind: "sent", turn } } : note,
        ),
      },
    }))
  },
}))

/** いまのセッションの付箋の鍵。 */
export function useReplySessionKey(): string {
  return useSession((session) =>
    session.state.session.kind === "starting"
      ? STARTING_SESSION_KEY
      : session.state.session.sessionId,
  )
}

/** そのセッションの付箋の並び（無ければ空の並びで、同じ参照を返す）。 */
export function notesOf(
  notesBySession: Readonly<Record<string, readonly ReplyNote[]>>,
  sessionKey: string,
): readonly ReplyNote[] {
  return notesBySession[sessionKey] ?? NO_NOTES
}

/** 同じ所の未送信の付箋（同じ所には1件までなので、あっても長さ1）。 */
function unsentNotesAt(notes: readonly ReplyNote[], key: ReplyTargetKey): readonly ReplyNote[] {
  return notes.filter((note) => note.state.kind === "unsent" && sameReplyKey(note.target.key, key))
}
