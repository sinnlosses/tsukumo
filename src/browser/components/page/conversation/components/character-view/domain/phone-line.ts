// 狭い画面の吹き出しに出す最新の1件を選ぶ。

import type { ShownReaction } from "../../../../../../../shared/session/shown-reaction.ts"
import type { Speech } from "../../../../../../../shared/session/turn-speech.ts"
import { recordClockStampWithDay, type ClockStamp } from "../../../domain/clock-stamp.ts"

/**
 * 狭い画面の吹き出しに出す最新の1件。
 * 反応を出していればその字（迎えの挨拶を書いている途中なら `writing`）、無ければ表示中のセリフの最後の1件。
 */
export type PhoneBalloonLine =
  | { readonly kind: "none" }
  | { readonly kind: "writing" }
  | { readonly kind: "text"; readonly text: string; readonly time: ClockStamp }

export function phoneLineOf(
  reaction: ShownReaction,
  speeches: readonly Speech[],
  now: number,
): PhoneBalloonLine {
  if (reaction.kind === "shown") {
    return {
      kind: "text",
      text: reaction.line.text,
      time: recordClockStampWithDay(reaction.time, now),
    }
  }
  if (reaction.kind === "writing") {
    return { kind: "writing" }
  }
  const latest = speeches.at(-1)
  return latest === undefined
    ? { kind: "none" }
    : { kind: "text", text: latest.text, time: recordClockStampWithDay(latest.time, now) }
}
