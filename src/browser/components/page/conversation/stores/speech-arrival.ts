// 声が届いた瞬間（`SpeechArrival`）。
// 立ち絵の動きと吹き出しの出方が同じ状態を読むので、ページで1つ持つ。
// 判定は `useSession` の購読で書く（描画部品の effect では判定しない）。
// 作ったときの数えから始めるので、初めて見た件数は増えたと数えない。
// 姿の世代が替わったとき（復元・開き直し）は数えを取り直し、届いた瞬間を「無い」へ戻す。

import { create } from "zustand"

import { useSession } from "../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../utils/clock.ts"
import {
  NO_SPEECH_ARRIVAL,
  newestVoicesOf,
  speechArrivalOf,
  type NewestVoices,
  type SpeechArrival,
} from "../domain/speech-arrival.ts"

type SpeechArrivalState = {
  readonly arrival: SpeechArrival
  /** いまの一言（いちばん新しいやり取りの最後の声）が、いま届いたものとして、動きと出方をもう一度掛ける。声が無ければ何もしない。 */
  readonly replay: (at: number) => void
}

export const useSpeechArrival = create<SpeechArrivalState>()((set) => {
  let seen: NewestVoices = newestVoicesOf(useSession.getState().state)
  const onSessionChange = (
    next: ReturnType<typeof useSession.getState>,
    previous: ReturnType<typeof useSession.getState>,
  ): void => {
    if (next.generation !== previous.generation) {
      seen = newestVoicesOf(next.state)
      set({ arrival: NO_SPEECH_ARRIVAL })
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
    replay: (at) => {
      const voices = newestVoicesOf(useSession.getState().state)
      const arrival = speechArrivalOf(
        { turnId: voices.turnId, count: 0, chatMode: false },
        voices,
        at,
      )
      if (arrival.kind === "arrived") {
        set({ arrival })
      }
    },
  }
})
