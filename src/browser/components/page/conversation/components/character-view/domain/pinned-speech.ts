// 立ち絵がいま従っているセリフ（吹き出し・セリフのログの両方が共有する「留めた」状態）。
// 押すとその時の表情へ立ち絵が遡る仕事モードの対応物（docs/screen-design.md「会話を遡る」の
// 雑談モードの実装は、同じ役目を持つ雑談側の `ViewedSpeech`）。
//
// キーは (turnId, index)。ログはどのターンのセリフでも押せる1つの窓という扱いなので、
// タブ（`useTurnSelection`）を切り替えても留めた選択は解けない——過去のターンは記録から
// 不変に導けるので、雑談のように「窓から落ちて番号が指す先がずれる」ことが無い
// （吹き出しは、いま見えているターンの分しか描かないので、違うターンを留めているあいだは
// 印がどこにも付かないまま表情だけがそのセリフに合わせて変わる。docs/display.md「吹き出し」）。
//
// 新しいセリフが来たら失効するのは「いまも伸びているターン」を留めていたときだけ（過去の
// 閉じたターンは件数が動かないので、実質いつまでも留められる）。

import type { Speech } from "../../../../../../../shared/session/session-state.ts"

/** 留めている行（吹き出し・セリフのログの両方へ、いまの印の位置として渡す）。 */
export type PinnedSpeech = { readonly turnId: number; readonly index: number }

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

/**
 * 行を押したときの次の状態。もう留めている行をもう一度押したら「最新」へ戻す
 * （docs/screen-design.md「利用者が解くなら、留めた行をもう一度押す」）。
 */
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
 * 留めた行のセリフ（失効していれば undefined）。`speechesOfTurn` はそのターンのセリフを古い→
 * 新しいの順で返す関数で、見つからなければ undefined（窓から落ちた・存在しないターンを指すとき）。
 *
 * 件数が押した時点から変わっていれば失効する（過去の閉じたターンは件数が動かないので、
 * まだ伸びている今のターンを留めたときだけ効く）。
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
 * その行に印を付けるか。留めていればその行だけ、留めていなければ「いま表示しているターン」の
 * 最後の行（{@link defaultTurnId} と {@link defaultIndex}）。`pinned` は
 * {@link pinnedSpeechOf} が返す形（吹き出しとセリフのログの両方が、留めた行そのものだけを
 * 見られればよいので、失効の判定に要る `speechCountAtPin` までは渡さない）。
 */
export function isSpeechSelected(
  pinned: PinnedSpeech | undefined,
  turnId: number,
  index: number,
  defaultTurnId: number | undefined,
  defaultIndex: number | undefined,
): boolean {
  if (pinned !== undefined) {
    return pinned.turnId === turnId && pinned.index === index
  }
  return defaultTurnId !== undefined && turnId === defaultTurnId && index === defaultIndex
}
