// 入力欄の上の「頼みごと」の列のロジック。
// まだ送っていない付箋を並べ、順番の入れ替えと「まとめて頼む」を持つ。

import { useMainViewTurns } from "../../../../../../stores/main-view-turn.ts"
import {
  notesOf,
  useReplyNotes,
  useReplySessionKey,
  type ReplyNote,
} from "../../../../../../stores/reply-note-list.ts"
import { useTurnRunning } from "../../../../../../stores/session.ts"
import { reportTitleLookup } from "../../../domain/reply-batch-draft.ts"
import { armAfterTurn, draftReplyBatch, useReplyBatch } from "../../../stores/reply-batch.ts"

const IDLE_GUIDE = "まとめて1つの依頼にする。送るのは ⌘⏎"
const RUNNING_GUIDE = "いまは作業中。聞くはいつでも送れる"
const DRAFT_LABEL = "まとめて頼む"
const AFTER_TURN_LABEL = "終わったら頼む"
const ARMED_LABEL = "頼む予約済み"

export type ReplyNoteQueueModel = {
  /** まだ送っていない付箋（列の並び）。 */
  readonly notes: readonly ReplyNote[]
  /** 列の下の案内。作業中は「聞く」だけが送れると伝える。 */
  readonly guide: string
  /** 押すボタンの字。作業中は「終わったら頼む」（押したあとは「頼む予約済み」）。 */
  readonly draftLabel: string
  /** 「頼む予約済み」で、もう押せないか。 */
  readonly draftDisabled: boolean
  readonly onMove: (id: string, toIndex: number) => void
  /** 待ちのときはまとめた下書きを入力欄に入れる。作業中は終わったときに入れる予約をする。送らない。 */
  readonly onDraft: () => void
}

export function useReplyNoteQueue(): ReplyNoteQueueModel {
  const sessionKey = useReplySessionKey()
  const allNotes = useReplyNotes((state) => notesOf(state.notesBySession, sessionKey))
  const moveNote = useReplyNotes((state) => state.moveNote)
  const turns = useMainViewTurns()
  const running = useTurnRunning()
  const armed = useReplyBatch((state) => state.armedSessionKey === sessionKey)
  const notes = allNotes.filter((note) => note.state.kind === "unsent")
  return {
    notes,
    guide: running ? RUNNING_GUIDE : IDLE_GUIDE,
    draftLabel: running ? (armed ? ARMED_LABEL : AFTER_TURN_LABEL) : DRAFT_LABEL,
    draftDisabled: running && armed,
    onMove: (id, toIndex) => {
      moveNote(sessionKey, id, toIndex)
    },
    onDraft: () => {
      if (running) {
        armAfterTurn(sessionKey)
        return
      }
      draftReplyBatch(notes, reportTitleLookup(turns))
    },
  }
}
