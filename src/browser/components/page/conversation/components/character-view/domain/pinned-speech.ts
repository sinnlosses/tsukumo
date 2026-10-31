// 立ち絵がいま従っているセリフ（吹き出し・セリフのログの両方が共有する「留めた」状態）。
//
// キーは (turnId, index)。
// ログはどのターンのセリフでも押せる1つの窓という扱いなので、タブ（`useTurnSelection`）を切り替えても留めた選択は解けない。
// 過去のターンは記録から不変に導けるので、番号が指す先がずれることが無い。
// 吹き出しはいま見えているターンの分しか描かないので、違うターンを留めているあいだは、印がどこにも付かないまま表情だけがそのセリフに合わせて変わる。
//
// 新しいセリフが来たら失効するのは「いまも伸びているターン」を留めていたときだけ（過去の閉じたターンは件数が動かないので、実質いつまでも留められる）。

import type { Speech } from "../../../../../../../shared/session/turn-speech.ts"
import type { TurnLine } from "../../../../../../../shared/session/turn-speech.ts"

/** 押すと遡る先のセリフ（ターンの番号と、そのターンの並びの中の位置）。 */
export type SpeechTarget = { readonly turnId: number; readonly index: number }

/** 留めている行（吹き出し・セリフのログの両方へ、いまの印の位置として渡す）。 */
export type PinnedSpeech = SpeechTarget

/** 立ち絵がいま従っているセリフの状態。既定は「最新」（何も押していない）。 */
export type ViewedSpeech =
  | { readonly kind: "latest" }
  | {
      readonly kind: "pinned"
      readonly turnId: number
      readonly index: number
      /** 押した時点のそのターンのセリフの件数（失効の判定に使う。{@link resolvePinnedSpeech}）。 */
      readonly speechCountAtPin: number
    }

export const LATEST_VIEWED_SPEECH: ViewedSpeech = { kind: "latest" }

/** 行を押したときの次の状態。もう留めている行をもう一度押したら「最新」へ戻す。 */
export function toggledViewedSpeech(
  viewed: ViewedSpeech,
  turnId: number,
  index: number,
  speechCountAtPin: number,
): ViewedSpeech {
  if (viewed.kind === "pinned" && viewed.turnId === turnId && viewed.index === index) {
    return LATEST_VIEWED_SPEECH
  }
  return { kind: "pinned", turnId, index, speechCountAtPin }
}

/** 留めている行。失効の判定はしないので、{@link resolvePinnedSpeech} が返したときだけ使う。 */
export function pinnedSpeechOf(viewed: ViewedSpeech): PinnedSpeech | undefined {
  return viewed.kind === "pinned" ? { turnId: viewed.turnId, index: viewed.index } : undefined
}

/**
 * 留めた行のセリフ（失効していれば undefined）。
 * `speechesOfTurn` はそのターンのセリフを古い→新しいの順で返す関数で、見つからなければ undefined（存在しないターンを指すとき）。
 * 件数が押した時点から変わっていれば失効する。
 */
export function resolvePinnedSpeech(
  viewed: ViewedSpeech,
  speechesOfTurn: (turnId: number) => readonly Speech[] | undefined,
): Speech | undefined {
  if (viewed.kind === "latest") {
    return undefined
  }
  const speeches = speechesOfTurn(viewed.turnId)
  if (speeches === undefined || speeches.length !== viewed.speechCountAtPin) {
    return undefined
  }
  return speeches[viewed.index]
}

/**
 * 印を付ける行。
 * 留めていればその行、留めていなければ「いま表示しているターン」の最後の行。どちらも無ければ `none`。
 */
export type MarkedSpeech = { readonly kind: "none" } | ({ readonly kind: "at" } & SpeechTarget)

export function isSpeechSelected(marked: MarkedSpeech, turnId: number, index: number): boolean {
  return marked.kind === "at" && marked.turnId === turnId && marked.index === index
}

/**
 * 今のターンの吹き出し（`SessionState.speeches`。`speak` のセリフだけ）の各件が、そのターンの並び（`TurnSpeech.speeches`。反応を含む）の何番目か。
 * 吹き出しは並びの `speak` のセリフの末尾 `balloonCount` 件にあたる。足りなければ undefined（位置を決められないので押しても留めない）。
 */
export function balloonLineIndices(
  lines: readonly TurnLine[],
  balloonCount: number,
): readonly number[] | undefined {
  const spoken = lines.flatMap((line, index) => (line.source === "speak" ? [index] : []))
  return spoken.length < balloonCount ? undefined : spoken.slice(spoken.length - balloonCount)
}
