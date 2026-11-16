// 初回の説明のうち、利用者が「分かった」を押した（か、余白を指した）ものをタブの中で共有し、端末の好みへ書く。

import { create } from "zustand"

import {
  FIRST_NOTE_TEXT,
  type FirstNoteId,
  loadSeenFirstNotes,
  saveSeenFirstNotes,
} from "../domain/first-note.ts"

type FirstNoteSeenState = {
  readonly seen: readonly FirstNoteId[]
  readonly markSeen: (id: FirstNoteId) => void
  /** 覚えた鍵をすべて消し、説明をまた初回として出す。 */
  readonly resetAll: () => void
}

export const useFirstNoteSeen = create<FirstNoteSeenState>()((set, get) => ({
  seen: loadSeenFirstNotes(),
  markSeen: (id) => {
    const { seen } = get()
    if (seen.includes(id)) {
      return
    }
    const next = [...seen, id]
    saveSeenFirstNotes(next)
    set({ seen: next })
  },
  resetAll: () => {
    saveSeenFirstNotes([])
    set({ seen: [] })
  },
}))

/** `ids` のうち、まだ見ていない説明と、「分かった」を押したときの記憶の書き方。 */
export function useFirstNoteList(ids: readonly FirstNoteId[]): {
  readonly notes: readonly { readonly id: FirstNoteId; readonly text: string }[]
  readonly onAcknowledge: (id: string) => void
} {
  const seen = useFirstNoteSeen((state) => state.seen)
  const markSeen = useFirstNoteSeen((state) => state.markSeen)
  return {
    notes: ids.filter((id) => !seen.includes(id)).map((id) => ({ id, text: FIRST_NOTE_TEXT[id] })),
    onAcknowledge: (id) => {
      const known = ids.find((candidate) => candidate === id)
      if (known !== undefined) {
        markSeen(known)
      }
    },
  }
}
