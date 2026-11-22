// 仕事の流れの各行に掛ける、いまの一言（明るさと尾）の出し方。

import type { ViewedSpeech } from "../../../domain/pinned-speech.ts"
import type { SpeechArrivalBubble } from "../../../domain/speech-arrival.ts"

/** 流れの1行。セリフだけがやり取りの中の位置（`speechIndex`）を持つ。 */
type PresentedItem = {
  readonly kind: string
  readonly speechIndex?: number
}

/** 留めたセリフが、渡した並びのどこにあるか。 */
export type PinnedPlace =
  | { readonly kind: "none" }
  | { readonly kind: "at"; readonly index: number }
  | { readonly kind: "outside" }

const NO_PINNED_PLACE = { kind: "none" } as const satisfies PinnedPlace

/** 留めた状態から、`turnId` のやり取りの並び `items` の中の置き場を出す。別のやり取り・別の並び（畳みの中など）にあれば `outside`。 */
export function pinnedPlaceOf(
  items: readonly PresentedItem[],
  turnId: number,
  viewed: ViewedSpeech,
): PinnedPlace {
  if (viewed.kind === "latest") {
    return NO_PINNED_PLACE
  }
  const index =
    viewed.turnId === turnId
      ? items.findIndex((item) => item.kind === "say" && item.speechIndex === viewed.index)
      : -1
  return index < 0 ? { kind: "outside" } : { kind: "at", index }
}

export type SayLiveness = "plain" | "live"

export type RowPresentation = {
  /** セリフの明るさ（いまの一言）。セリフでない行は `plain`。 */
  readonly liveness: SayLiveness
  /** 立ち絵が従っているセリフか（尾を付ける1件）。 */
  readonly followed: boolean
  /** 押して留めたセリフか。 */
  readonly pinned: boolean
  /** 届いたばかりのセリフに付ける吹き出しの出方。付けない行は省く。 */
  readonly arrival?: SpeechArrivalBubble
}

/** 提示が決まっていない行（並びの外・並びが短い）の既定。 */
export const PLAIN_PRESENTATION = {
  liveness: "plain",
  followed: false,
  pinned: false,
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
  /** 押して留めたセリフの置き場。留めているあいだは、その1件だけが明るく尾が付き、ほかは落ち着く。 */
  readonly pinned: PinnedPlace
  /** 届いたばかりの声の、並びの中の位置と出方。従っている行がその位置のときだけ、出方を付ける。 */
  readonly arriving?: { readonly index: number; readonly bubble: SpeechArrivalBubble }
}

export function streamPresentationOf(
  items: readonly PresentedItem[],
  context: PresentationContext,
): readonly RowPresentation[] {
  const lastSayAt = items.findLastIndex((item) => item.kind === "say")
  return items.map((_item, index): RowPresentation => {
    if (context.pinned.kind !== "none") {
      const pinned = context.pinned.kind === "at" && context.pinned.index === index
      return {
        liveness: pinned ? "live" : "plain",
        followed: pinned,
        pinned,
      }
    }
    const followed = context.follow && index === lastSayAt
    return {
      liveness: context.live && index === lastSayAt ? "live" : "plain",
      followed,
      pinned: false,
      ...(followed &&
      context.arriving !== undefined &&
      context.arriving.index === items[index]?.speechIndex
        ? { arrival: context.arriving.bubble }
        : {}),
    }
  })
}
