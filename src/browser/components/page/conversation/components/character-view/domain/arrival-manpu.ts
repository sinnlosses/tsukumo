// 立ち絵に出す漫符を、声が届いた漫符と終わり方の漫符から選ぶ。

import type { FaceAt } from "../../../../../../../shared/character-pack/character-definition.ts"
import {
  faceAtOf,
  type CharacterInfo,
} from "../../../../../../../shared/character-pack/character.ts"
import type { EndingManpu, EndingManpuShown } from "../../../../../../domain/portrait-motion.ts"
import {
  SPEECH_ARRIVALS,
  type SpeechArrival,
  type SpeechManpu,
  type VoiceAt,
} from "../../../domain/speech-arrival.ts"

/** エフェクトを出す窓（ミリ秒）。いちばん長いエフェクト（泡沫の 2.6 秒）より長く取り、開き直した画面で古い届きを再生しない。 */
const MANPU_WINDOW_MS = 3000

export type ArrivalManpu =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly manpu: SpeechManpu | EndingManpu
      readonly at: number
      readonly faceAt: FaceAt
      /** 届いた声のエフェクトなら、その声。終わり方のエフェクトには無い。 */
      readonly voice?: VoiceAt
    }

/** 声が届いた漫符と終わり方の漫符のうち新しいほう。終わり方の漫符は今の表情の顔の位置に出す。 */
export function newerManpu(
  arrival: ArrivalManpu,
  ending: EndingManpuShown,
  faceAt: FaceAt,
): ArrivalManpu {
  if (ending.kind === "none" || (arrival.kind === "shown" && arrival.at > ending.at)) {
    return arrival
  }
  return { kind: "shown", manpu: ending.manpu, at: ending.at, faceAt }
}

/** 動きを減らす設定では出さない。動きが `still` の表情でも、届いた表情から出す。 */
export function arrivalManpuOf(
  arrived: SpeechArrival,
  reducedMotion: boolean,
  now: number,
  character?: CharacterInfo,
): ArrivalManpu {
  if (arrived.kind === "none" || reducedMotion || now - arrived.at >= MANPU_WINDOW_MS) {
    return { kind: "none" }
  }
  const manpu = arrived.manpu ?? SPEECH_ARRIVALS[arrived.expression].manpu
  if (manpu === "none") {
    return { kind: "none" }
  }
  return {
    kind: "shown",
    manpu,
    at: arrived.at,
    faceAt: faceAtOf(arrived.expression, character),
    voice: { turnId: arrived.turnId, index: arrived.index },
  }
}
