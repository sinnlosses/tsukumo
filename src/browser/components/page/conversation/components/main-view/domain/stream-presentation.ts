// 仕事の流れの各行に掛ける、いまの一言（明るさと尾）と時刻の出し方。

import { recordClockStamp, visibleClockFlags } from "../../../domain/clock-stamp.ts"

/** 流れの1行。セリフ・投稿だけが時刻（`at`）を持つ。 */
type PresentedItem = { readonly kind: string; readonly at?: number }

export type SayLiveness = "plain" | "live" | "live-with-tail"

export type RowPresentation = {
  /** 時刻を見える字で出すか。 */
  readonly timeShown: boolean
  /** セリフの明るさと尾。セリフでない行は `plain`。 */
  readonly liveness: SayLiveness
}

/** 提示が決まっていない行（並びの外・並びが短い）の既定。 */
export const PLAIN_PRESENTATION = {
  timeShown: true,
  liveness: "plain",
} as const satisfies RowPresentation

/** 読み上げ用の、利用者の投稿の話し手の名前。 */
export const USER_SPEAKER_NAME = "あなた"

export type PresentationContext = {
  /** いちばん新しいやり取りが作業中か答え待ちか。 */
  readonly live: boolean
  /** 答え待ち（お伺いの札が流れの末尾に続く）。 */
  readonly asking: boolean
  /** 流れの末尾に書きかけの紙が続くか。 */
  readonly hasDraft: boolean
  readonly timeZone: string
}

const FULL_WIDTH_KINDS: ReadonlySet<string> = new Set(["question", "body", "failure", "fold"])

export function streamPresentationOf(
  items: readonly PresentedItem[],
  context: PresentationContext,
): readonly RowPresentation[] {
  const flags = visibleClockFlags(
    items.map((item) =>
      item.at === undefined
        ? ({ kind: "unknown" } as const)
        : recordClockStamp({ kind: "stamped", at: item.at }, context.timeZone),
    ),
  )
  const liveAt = context.live ? items.findLastIndex((item) => item.kind === "say") : -1
  return items.map((_item, index) => ({
    timeShown: flags[index] === true,
    liveness: index === liveAt ? livenessOf(items[index + 1], context) : "plain",
  }))
}

function livenessOf(next: PresentedItem | undefined, context: PresentationContext): SayLiveness {
  const fullWidthBelow =
    next === undefined ? context.asking || context.hasDraft : FULL_WIDTH_KINDS.has(next.kind)
  return fullWidthBelow ? "live" : "live-with-tail"
}
