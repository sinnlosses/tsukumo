// 立ち絵がいま従っているセリフ（セリフの行を押して「留めた」状態）。
//
// キーは (turnId, index)。どのやり取りのセリフ（反応を含む）の行でも留められ、広い画面の流れ・定位置の声・狭い画面のログが1つの状態を共有する。
// 過去のやり取りは記録から不変に導けるので、番号が指す先がずれることが無い。
// 違うやり取りを留めているあいだは、表情だけがそのセリフに合わせて変わる。
//
// 解ける条件は、いちばん新しいやり取りのセリフ（反応を含む）の件数か番号が留めた時点から変わったとき（`expiredViewedSpeech`）と、見ているやり取り（hash の `turn`）が替わったとき。
// どのやり取りの行を留めていても同じ規則で解く。

import type { Speech, TurnSpeech } from "../../../../../shared/session/turn-speech.ts"
import type { ViewedTurn } from "../../../../stores/location-hash.ts"

/** 押すと遡る先のセリフ（やり取りの番号と、そのやり取りの並びの中の位置）。 */
export type SpeechTarget = { readonly turnId: number; readonly index: number }

/** 留めている行（セリフのログへ、いまの印の位置として渡す）。 */
export type PinnedSpeech = SpeechTarget

/** 留めた時点の「いちばん新しいやり取り」と、見ていたやり取り（失効の判定に使う）。 */
export type PinAnchor = {
  /** いちばん新しいやり取りの番号。やり取りが無ければ無い。 */
  readonly newestTurnId?: number
  /** いちばん新しいやり取りのセリフ（反応を含む）の件数。 */
  readonly newestSpeechCount: number
  /** 留めたときに hash が指していたやり取り。 */
  readonly viewedTurn: ViewedTurn
}

/** 立ち絵がいま従っているセリフの状態。既定は「最新」（何も押していない）。 */
export type ViewedSpeech =
  | { readonly kind: "latest" }
  | ({ readonly kind: "pinned" } & SpeechTarget & PinAnchor)

export const LATEST_VIEWED_SPEECH: ViewedSpeech = { kind: "latest" }

/** 行を押したときの次の状態。もう留めている行をもう一度押したら「最新」へ戻す。 */
export function toggledViewedSpeech(
  viewed: ViewedSpeech,
  turnId: number,
  index: number,
  anchor: PinAnchor,
): ViewedSpeech {
  if (viewed.kind === "pinned" && viewed.turnId === turnId && viewed.index === index) {
    return LATEST_VIEWED_SPEECH
  }
  return { kind: "pinned", turnId, index, ...anchor }
}

/** 留めている行。失効の判定はしないので、`expiredViewedSpeech` を通した状態から読む。 */
export function pinnedSpeechOf(viewed: ViewedSpeech): PinnedSpeech | undefined {
  return viewed.kind === "pinned" ? { turnId: viewed.turnId, index: viewed.index } : undefined
}

/** 留めた行のセリフ。`speechesOfTurn` はそのやり取りのセリフを古い→新しいの順で返す関数で、番号が並びに無ければ undefined。 */
export function resolvePinnedSpeech(
  viewed: ViewedSpeech,
  speechesOfTurn: (turnId: number) => readonly Speech[] | undefined,
): Speech | undefined {
  if (viewed.kind === "latest") {
    return undefined
  }
  return speechesOfTurn(viewed.turnId)?.[viewed.index]
}

/** いまの記録の並びから、留めるときに控える {@link PinAnchor} を作る。 */
export function pinAnchorOf(turns: readonly TurnSpeech[], viewedTurn: ViewedTurn): PinAnchor {
  const newest = turns.at(-1)
  return {
    newestTurnId: newest?.id,
    newestSpeechCount: newest?.speeches.length ?? 0,
    viewedTurn,
  }
}

/**
 * 留めた状態の失効。いちばん新しいやり取りの番号か件数、または見ているやり取りが留めた時点と違えば「最新」を返し、そうでなければ受けた状態をそのまま返す。
 */
export function expiredViewedSpeech(
  viewed: ViewedSpeech,
  turns: readonly TurnSpeech[],
  viewedTurn: ViewedTurn,
): ViewedSpeech {
  if (viewed.kind === "latest") {
    return viewed
  }
  const now = pinAnchorOf(turns, viewedTurn)
  const unchanged =
    now.newestTurnId === viewed.newestTurnId &&
    now.newestSpeechCount === viewed.newestSpeechCount &&
    now.viewedTurn === viewed.viewedTurn
  return unchanged ? viewed : LATEST_VIEWED_SPEECH
}

/**
 * 印を付ける行。
 * 留めていればその行、留めていなければ「いま表示しているターン」の最後の行。どちらも無ければ `none`。
 */
export type MarkedSpeech = { readonly kind: "none" } | ({ readonly kind: "at" } & SpeechTarget)

export function isSpeechSelected(marked: MarkedSpeech, turnId: number, index: number): boolean {
  return marked.kind === "at" && marked.turnId === turnId && marked.index === index
}
