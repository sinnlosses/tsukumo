// 声が届いた瞬間（`SpeechArrival`）。
// 立ち絵の動きと吹き出しの出方が同じ状態を読むので、ページで1つ持つ。
// 判定は `useSession` の購読で書く（描画部品の effect では判定しない）。
// 作ったときの数えから始めるので、初めて見た件数は増えたと数えない。
// 姿の世代が替わったとき（復元・開き直し）は数えを取り直し、届いた瞬間とエフェクトの控えを「無い」へ戻す。

import { create } from "zustand"

import type { EndingManpu } from "../../../../domain/portrait-motion.ts"
import { useSession } from "../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../utils/clock.ts"
import {
  NO_SHOWN_MANPU,
  NO_SPEECH_ARRIVAL,
  newestVoicesOf,
  shownManpuOf,
  speechArrivalOf,
  withShownManpu,
  type NewestVoices,
  type ShownManpu,
  type SpeechArrival,
  type SpeechManpu,
} from "../domain/speech-arrival.ts"

type SpeechArrivalState = {
  readonly arrival: SpeechArrival
  /** いまの声のあいだに実際に出したエフェクトの控え。 */
  readonly shown: ShownManpu
  /**
   * いまの一言（いちばん新しいやり取りの最後の声）が、いま届いたものとして、動きと出方をもう一度掛ける。
   * その声で実際に出したエフェクトの控えがあれば、表情から決めずにそれを出す。声が無ければ何もしない。
   */
  readonly replay: (at: number) => void
  /** エフェクトを出したときに、いまの声と組で控える。 */
  readonly recordShown: (manpu: SpeechManpu | EndingManpu) => void
}

export const useSpeechArrival = create<SpeechArrivalState>()((set, get) => {
  let seen: NewestVoices = newestVoicesOf(useSession.getState().state)
  const onSessionChange = (
    next: ReturnType<typeof useSession.getState>,
    previous: ReturnType<typeof useSession.getState>,
  ): void => {
    if (next.generation !== previous.generation) {
      seen = newestVoicesOf(next.state)
      set({ arrival: NO_SPEECH_ARRIVAL, shown: NO_SHOWN_MANPU })
      return
    }
    if (next.state === previous.state) {
      return
    }
    const voices = newestVoicesOf(next.state)
    const arrival = speechArrivalOf(seen, voices, nowEpochMilliseconds())
    seen = voices
    if (arrival.kind === "arrived") {
      set({ arrival })
    }
  }
  useSession.subscribe(onSessionChange)
  return {
    arrival: NO_SPEECH_ARRIVAL,
    shown: NO_SHOWN_MANPU,
    replay: (at) => {
      const voices = newestVoicesOf(useSession.getState().state)
      const arrival = speechArrivalOf(
        { turnId: voices.turnId, count: 0, chatMode: false },
        voices,
        at,
      )
      if (arrival.kind === "arrived") {
        set({ arrival: withShownManpu(arrival, get().shown) })
      }
    },
    recordShown: (manpu) => {
      set({ shown: shownManpuOf(newestVoicesOf(useSession.getState().state), manpu) })
    },
  }
})
