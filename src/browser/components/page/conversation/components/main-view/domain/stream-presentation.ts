// 仕事の流れの各行に掛ける、いまの一言（明るさと尾）と時刻の出し方。

import { recordClockStamp, visibleClockFlags } from "../../../domain/clock-stamp.ts"

/** 流れの1行。セリフ・投稿だけが時刻（`at`）を持つ。 */
type PresentedItem = { readonly kind: string; readonly at?: number }

export type SayLiveness = "plain" | "live"

export type RowPresentation = {
  /** 時刻を見える字で出すか。 */
  readonly timeShown: boolean
  /** セリフの明るさ（いまの一言）。セリフでない行は `plain`。 */
  readonly liveness: SayLiveness
  /** 立ち絵が従っているセリフか（尾を付ける1件）。 */
  readonly followed: boolean
}

/** 提示が決まっていない行（並びの外・並びが短い）の既定。 */
export const PLAIN_PRESENTATION = {
  timeShown: true,
  liveness: "plain",
  followed: false,
} as const satisfies RowPresentation

/** 読み上げ用の、利用者の投稿の話し手の名前。 */
export const USER_SPEAKER_NAME = "あなた"

export type PresentationContext = {
  /** いちばん新しいやり取りが作業中か答え待ちか。明るくするのは最新のセリフ1件。 */
  readonly live: boolean
  /**
   * 立ち絵が流れの最新のセリフに従うか。
   * 入力欄の上の定位置が声を出しているあいだは、立ち絵はそちらに従うので偽にする。
   */
  readonly follow: boolean
  readonly timeZone: string
}

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
  const lastSayAt = items.findLastIndex((item) => item.kind === "say")
  return items.map((_item, index) => ({
    timeShown: flags[index] === true,
    liveness: context.live && index === lastSayAt ? "live" : "plain",
    followed: context.follow && index === lastSayAt,
  }))
}
