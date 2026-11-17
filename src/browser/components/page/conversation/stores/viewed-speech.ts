// 立ち絵がいま従っているセリフ（`ViewedSpeech`）。
// 広い画面の流れ・定位置の声・狭い画面のログが同じ状態を読むので、ページで1つ持つ。
//
// 解く書き口はここの2つだけ（部品の effect では解かない）。
// 1つは `useSession` の購読で、姿が変わるたびに失効の規則（`expiredViewedSpeech`）に掛け、姿の世代が替わったときも解く。
// もう1つは読み込み時に1回だけ張る `hashchange` の購読で、見ているやり取りが留めた時点と違えば解く。

import { create } from "zustand"

import { turnSpeeches } from "../../../../../shared/session/turn-speech.ts"
import { readHashRoute } from "../../../../stores/location-hash.ts"
import { useSession } from "../../../../stores/session.ts"
import {
  expiredViewedSpeech,
  LATEST_VIEWED_SPEECH,
  pinAnchorOf,
  toggledViewedSpeech,
  type ViewedSpeech,
} from "../domain/pinned-speech.ts"

type ViewedSpeechState = {
  readonly viewed: ViewedSpeech
  /** 行を押す（留める・同じ行をもう一度で最新へ戻す）。 */
  readonly toggle: (turnId: number, index: number) => void
  /** 留めを解いて最新へ戻す。 */
  readonly release: () => void
}

export const useViewedSpeech = create<ViewedSpeechState>()((set, get) => {
  const settle = (): void => {
    const { viewed } = get()
    const expired = expiredViewedSpeech(
      viewed,
      turnSpeeches(useSession.getState().state.records),
      readHashRoute().turn,
    )
    if (expired !== viewed) {
      set({ viewed: expired })
    }
  }
  useSession.subscribe((next, previous) => {
    if (next.generation !== previous.generation) {
      if (get().viewed.kind === "pinned") {
        set({ viewed: LATEST_VIEWED_SPEECH })
      }
      return
    }
    if (next.state !== previous.state) {
      settle()
    }
  })
  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", settle)
  }
  return {
    viewed: LATEST_VIEWED_SPEECH,
    toggle: (turnId, index) => {
      const turns = turnSpeeches(useSession.getState().state.records)
      set({
        viewed: toggledViewedSpeech(
          get().viewed,
          turnId,
          index,
          pinAnchorOf(turns, readHashRoute().turn),
        ),
      })
    },
    release: () => {
      if (get().viewed.kind === "pinned") {
        set({ viewed: LATEST_VIEWED_SPEECH })
      }
    },
  }
})
