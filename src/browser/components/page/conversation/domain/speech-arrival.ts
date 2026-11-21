// 声が届いた瞬間の出方。
// 表情ごとに、立ち絵の1回の動きと吹き出しの出方を決め、「いちばん新しいやり取りに声が1件増えた」を前後の数えから判定する。
// 時計は引数で受ける。

import type { Expression } from "../../../../../shared/character-pack/expression.ts"
import type { SessionState } from "../../../../../shared/session/session-state.ts"
import { greetingOnShow } from "../../../../../shared/session/shown-reaction.ts"
import { turnSpeeches } from "../../../../../shared/session/turn-speech.ts"
import { PRE_REQUEST_TURN_ID } from "../../../../../shared/session/turn.ts"
import type { ArrivalMotion } from "../../../../domain/portrait-motion.ts"

/** 吹き出しの出方。形は CSS の `[data-arrival]` が持つ。 */
export type SpeechArrivalBubble = "pop" | "ease" | "swell" | "shake" | "sink" | "snap"

/** 出方が付いている長さ（ミリ秒）。いちばん長い出方（0.7 秒）より長く取る。 */
const ARRIVING_BUBBLE_WINDOW_MS = 800

/** 立ち絵の顔のまわりに1回だけ出るエフェクトの種類。形と動きは CSS（`stage/manpu.css`）が持つ。 */
export type SpeechManpu =
  | "ring"
  | "sparkle"
  | "sweat"
  | "flash"
  | "ripple"
  | "rain"
  | "petals"
  | "bubbles"

/**
 * 表情ごとの、立ち絵の1回の動き（`still` は動かない）・吹き出しの出方・エフェクト（`none` は出さない）。
 * エフェクトは動きと独立に、届いた表情から決まる。
 */
export const SPEECH_ARRIVALS = {
  default: { motion: "nod", bubble: "pop", manpu: "none" },
  thinking: { motion: "lean", bubble: "ease", manpu: "ring" },
  proud: { motion: "success", bubble: "swell", manpu: "sparkle" },
  flustered: { motion: "failure", bubble: "shake", manpu: "sweat" },
  serious: { motion: "still", bubble: "snap", manpu: "flash" },
  curious: { motion: "tilt", bubble: "ease", manpu: "ripple" },
  sad: { motion: "sink", bubble: "sink", manpu: "rain" },
  excited: { motion: "success", bubble: "swell", manpu: "petals" },
  bored: { motion: "sink", bubble: "sink", manpu: "bubbles" },
} as const satisfies Record<
  Expression,
  {
    readonly motion: ArrivalMotion | "still"
    readonly bubble: SpeechArrivalBubble
    readonly manpu: SpeechManpu | "none"
  }
>

/** いちばん新しいやり取りの声の数え。`expression` は最後の声の表情で、声が1件も無ければ省く。 */
export type NewestVoices = {
  readonly turnId: number
  readonly count: number
  readonly expression?: Expression
  readonly chatMode: boolean
}

/** 声が届いた瞬間。`index` は流れの中の位置（件数 - 1）。 */
export type SpeechArrival =
  | { readonly kind: "none" }
  | {
      readonly kind: "arrived"
      readonly turnId: number
      readonly index: number
      readonly expression: Expression
      readonly at: number
    }

export const NO_SPEECH_ARRIVAL = { kind: "none" } as const satisfies SpeechArrival

/**
 * いちばん新しいやり取りの声（流れのセリフ・反応の行・定位置の声）を数える。
 * 迎えの挨拶は、画面が出してから記録に積まれる。出している挨拶に記録がまだ無いあいだは1件に数える。
 */
export function newestVoicesOf(state: SessionState): NewestVoices {
  const onShow = greetingOnShow(state)
  const hasGreetingRecord = state.records.some(
    (record) => record.kind === "reaction" && record.reaction === "welcome",
  )
  if (onShow.kind === "shown" && !hasGreetingRecord) {
    return {
      turnId: PRE_REQUEST_TURN_ID,
      count: 1,
      expression: onShow.greeting.expression,
      chatMode: state.chatMode,
    }
  }
  const newest = turnSpeeches(state.records).at(-1)
  return {
    turnId: newest?.id ?? PRE_REQUEST_TURN_ID,
    count: newest?.speeches.length ?? 0,
    expression: newest?.expression,
    chatMode: state.chatMode,
  }
}

/** 前の数えから次の数えへ、同じやり取りで声が増えた・新しいやり取りで声が出たなら、届いた瞬間。雑談は数えない。 */
export function speechArrivalOf(
  previous: NewestVoices,
  next: NewestVoices,
  at: number,
): SpeechArrival {
  if (previous.chatMode || next.chatMode || next.expression === undefined) {
    return NO_SPEECH_ARRIVAL
  }
  const before = previous.turnId === next.turnId ? previous.count : 0
  if (next.count <= before) {
    return NO_SPEECH_ARRIVAL
  }
  return {
    kind: "arrived",
    turnId: next.turnId,
    index: next.count - 1,
    expression: next.expression,
    at,
  }
}

/** いま出方が付いている声。 */
export type ArrivingBubble =
  | { readonly kind: "none" }
  | {
      readonly kind: "arriving"
      readonly turnId: number
      readonly index: number
      readonly bubble: SpeechArrivalBubble
    }

export const NO_ARRIVING_BUBBLE = { kind: "none" } as const satisfies ArrivingBubble

/** 届いた時刻から窓の中なら、その声に付ける出方。 */
export function arrivingBubbleOf(arrival: SpeechArrival, now: number): ArrivingBubble {
  if (arrival.kind === "none" || now - arrival.at >= ARRIVING_BUBBLE_WINDOW_MS) {
    return NO_ARRIVING_BUBBLE
  }
  return {
    kind: "arriving",
    turnId: arrival.turnId,
    index: arrival.index,
    bubble: SPEECH_ARRIVALS[arrival.expression].bubble,
  }
}

/** 出方が付いている残り時間（ミリ秒）。付いていなければ 0。 */
export function arrivingBubbleRemainingMs(arrival: SpeechArrival, now: number): number {
  return arrival.kind === "none" ? 0 : Math.max(0, arrival.at + ARRIVING_BUBBLE_WINDOW_MS - now)
}
