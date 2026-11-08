// 「まとめて頼む」で下書きに入れた付箋の組を、下書きに添えて持つ。
// 付箋の中身は利用者の書いた字なので、ここでは id の組だけを持つ。

import { create } from "zustand"

import { mainViewTurnsOf } from "../../../../stores/main-view-turn.ts"
import { notesOf, useReplyNotes, type ReplyNote } from "../../../../stores/reply-note-list.ts"
import { useSession } from "../../../../stores/session.ts"
import {
  replyBatchDraftOf,
  reportTitleLookup,
  type ReportTitleOf,
} from "../domain/reply-batch-draft.ts"
import { useComposerDraft } from "./composer-draft.ts"

type ReplyBatchState = {
  /** 下書きにまとめた付箋の id。まとめていない下書きでは空。 */
  readonly noteIds: readonly string[]
  /** 「終わったら頼む」を押した付箋の鍵。押していなければ空。 */
  readonly armedSessionKey: string
  readonly attachBatch: (noteIds: readonly string[]) => void
  readonly clearBatch: () => void
}

export const useReplyBatch = create<ReplyBatchState>()((set) => ({
  noteIds: [],
  armedSessionKey: "",
  attachBatch: (noteIds) => {
    set((state) => ({ noteIds: [...new Set([...state.noteIds, ...noteIds])] }))
  },
  clearBatch: () => {
    set({ noteIds: [] })
  },
}))

/**
 * 並び済みの未送信の付箋を1つの依頼の文面にして、下書きの後ろへ空行を挟んで足す。送らない。
 * 付箋が無ければ何もしない。
 */
export function draftReplyBatch(notes: readonly ReplyNote[], titleOf: ReportTitleOf): void {
  if (notes.length === 0) return
  useComposerDraft.getState().appendParagraphToDraft(replyBatchDraftOf(notes, titleOf))
  useReplyBatch.getState().attachBatch(notes.map((note) => note.id))
}

/** 作業が終わったときに下書きを入れるよう予約する（送らない）。 */
export function armAfterTurn(sessionKey: string): void {
  useReplyBatch.setState({ armedSessionKey: sessionKey })
}

/** いちばん新しいやり取りの `id`。まだ無ければ -1。 */
export function lastTurnId(): number {
  return mainViewTurnsOf(useSession.getState().state).at(-1)?.id ?? -1
}

/**
 * サーバが受け付けたあと、`previousLastTurnId` より新しいやり取りが現れた時点で、組の付箋を「送った」にする。
 * 番号はそのやり取りの `id`。1回だけ書いて購読を外す。
 */
export function settleBatchSent(
  sessionKey: string,
  noteIds: readonly string[],
  previousLastTurnId: number,
): void {
  const settle = (): boolean => {
    const turn = mainViewTurnsOf(useSession.getState().state).find(
      (candidate) => candidate.id > previousLastTurnId,
    )
    if (turn === undefined) return false
    useReplyNotes.getState().markSent(sessionKey, noteIds, turn.id)
    return true
  }
  if (settle()) return
  const unsubscribe = useSession.subscribe(() => {
    if (settle()) unsubscribe()
  })
}

// 下書きが空になったら（送った・消した）、組を外す。
useComposerDraft.subscribe((state) => {
  if (state.draft.text === "" && useReplyBatch.getState().noteIds.length > 0) {
    useReplyBatch.getState().clearBatch()
  }
})

// 作業が終わったとき、予約があれば下書きを入れる。
let wasRunning = useSession.getState().state.turn.kind === "running"
useSession.subscribe((session) => {
  const running = session.state.turn.kind === "running"
  const finished = wasRunning && !running
  wasRunning = running
  const sessionKey = useReplyBatch.getState().armedSessionKey
  if (!finished || sessionKey === "") return
  useReplyBatch.setState({ armedSessionKey: "" })
  const notes = notesOf(useReplyNotes.getState().notesBySession, sessionKey).filter(
    (note) => note.state.kind === "unsent",
  )
  draftReplyBatch(notes, reportTitleLookup(mainViewTurnsOf(session.state)))
})
