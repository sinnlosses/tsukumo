// 読み上げの領域に出す文（`LiveAnnouncer`）。
// 姿が進んで新しく読むものがあったときだけ、バッチを入れ替える。

import { create } from "zustand"

import { announcementsBetween } from "../domain/session-announcement.ts"
import { useSession } from "./session.ts"

export type AnnouncementBatch = {
  /** 入れ替えるたびに進む。同じ文面が続いても別の挿入として読ませる。 */
  readonly id: number
  readonly texts: readonly string[]
}

export type AnnouncementState = {
  readonly batch: AnnouncementBatch
}

export const useAnnouncement = create<AnnouncementState>()((set, get) => {
  useSession.subscribe((next, previous) => {
    if (next.state === previous.state || next.generation !== previous.generation) {
      return
    }
    const texts = announcementsBetween(previous.state, next.state)
    if (texts.length > 0) {
      set({ batch: { id: get().batch.id + 1, texts } })
    }
  })
  return { batch: { id: 0, texts: [] } }
})
