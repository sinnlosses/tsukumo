// 声が届いた瞬間（`SpeechArrival`）。
// 立ち絵の動きと吹き出しの出方が同じ状態を読むので、ページで1つ持つ。
// 判定は `useSession` の購読で書く（描画部品の effect では判定しない）。
// 作ったときの数えから始めるので、初めて見た件数は増えたと数えない。
// 姿の世代が替わったとき（復元・開き直し）は数えを取り直し、届いた瞬間とエフェクトの控えを「無い」へ戻す。

import { create } from "zustand"

import type { Expression } from "../../../../../shared/character-pack/expression.ts"
import type { EndingManpu } from "../../../../domain/portrait-motion.ts"
import { useSession } from "../../../../stores/session.ts"
import { nowEpochMilliseconds } from "../../../../utils/clock.ts"
import {
  NO_SHOWN_MANPUS,
  NO_SPEECH_ARRIVAL,
  newestVoicesOf,
  replayedArrivalOf,
  speechArrivalOf,
  withRecordedManpu,
  withShownManpu,
  type NewestVoices,
  type ShownManpus,
  type SpeechArrival,
  type SpeechManpu,
  type VoiceAt,
} from "../domain/speech-arrival.ts"

/** 掛け直す声。留めた行があればその行、無ければいまの一言。 */
export type ReplayTarget =
  | { readonly kind: "newest" }
  | ({ readonly kind: "pinned"; readonly expression: Expression } & VoiceAt)

type SpeechArrivalState = {
  readonly arrival: SpeechArrival
  /** 声ごとの、実際に出したエフェクトの控え。 */
  readonly shown: ShownManpus
  /**
   * 声が、いま届いたものとして、動きと出方をもう一度掛ける。
   * その声で実際に出したエフェクトの控えがあれば、表情から決めずにそれを出す。
   * いまの一言を掛け直すとき、声が無ければ何もしない。雑談では何もしない。
   */
  readonly replay: (at: number, target: ReplayTarget) => void
  /** エフェクトを出したときに、出した声と組で控える。声が無ければ、いまの一言と組で控える。 */
  readonly recordShown: (manpu: SpeechManpu | EndingManpu, voice?: VoiceAt) => void
}

export const useSpeechArrival = create<SpeechArrivalState>()((set, get) => {
  let seen: NewestVoices = newestVoicesOf(useSession.getState().state)
  const onSessionChange = (
    next: ReturnType<typeof useSession.getState>,
    previous: ReturnType<typeof useSession.getState>,
  ): void => {
    if (next.generation !== previous.generation) {
      seen = newestVoicesOf(next.state)
      set({ arrival: NO_SPEECH_ARRIVAL, shown: NO_SHOWN_MANPUS })
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
    shown: NO_SHOWN_MANPUS,
    replay: (at, target) => {
      const voices = newestVoicesOf(useSession.getState().state)
      const arrival =
        target.kind === "pinned"
          ? voices.chatMode
            ? NO_SPEECH_ARRIVAL
            : replayedArrivalOf(target, target.expression, at)
          : speechArrivalOf({ turnId: voices.turnId, count: 0, chatMode: false }, voices, at)
      if (arrival.kind === "arrived") {
        set({ arrival: withShownManpu(arrival, get().shown) })
      }
    },
    recordShown: (manpu, voice) => {
      const target =
        voice === undefined
          ? { kind: "newest" as const, voices: newestVoicesOf(useSession.getState().state) }
          : { kind: "at" as const, at: voice }
      set({ shown: withRecordedManpu(get().shown, target, manpu) })
    },
  }
})
