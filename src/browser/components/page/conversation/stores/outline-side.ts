// 左の札で選んでいる側（やり取り・セッション）。
// 保存せず、セッションの世代が替わったら「やり取り」へ戻す。
// セッション側の「今日」の基準になる、その側を出した時刻も持つ。

import { create } from "zustand"

import { useSession } from "../../../../stores/session.ts"

export type OutlineSide = "turns" | "sessions"

type OutlineSideState = {
  readonly side: OutlineSide
  /** 側を最後に選んだ時刻（エポックミリ秒）。セッション側の「今日」の基準。選ぶ前は無い。 */
  readonly shownAt?: number
  readonly selectSide: (side: OutlineSide, at: number) => void
}

export const useOutlineSide = create<OutlineSideState>()((set) => {
  useSession.subscribe((next, previous) => {
    if (next.generation !== previous.generation) {
      set({ side: "turns" })
    }
  })
  return {
    side: "turns",
    selectSide: (side, at) => {
      set({ side, shownAt: at })
    },
  }
})
