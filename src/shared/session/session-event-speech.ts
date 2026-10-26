// セッションの出来事（`SessionEvent`）のうち、`speak` ツールの呼び出しに関するものの型。

import type { Expression } from "../character-pack/expression.ts"

/** `speak` ツールの呼び出し。セリフと表情。 */
export type SpeechEvent = {
  readonly kind: "speech"
  readonly text: string
  readonly expression: Expression
}

/**
 * メインが呼んだ `speak` の呼び出し。サーバの中だけで流れる。
 * `CallReview.pass` が同じ `toolUseId` の `tool-finished` まで預かり、差し戻されていなければ `speech` に変えて流す（畳み込み・ブラウザには届かない）。
 */
export type SpeakCalledEvent = {
  readonly kind: "speak-called"
  readonly toolUseId: string
  readonly speech: SpeechEvent
}

/**
 * メインの `speak` が描かれた印。サーバの中だけで流れ、`CallReview.pass` が `speech` の直後に足す。
 * 委譲先の `speak` は `speech` のまま出どころが分からないので、メインのものだけを数える記録（トークン消費）がこの印を読む。
 * 畳み込みの姿は変えず、ブラウザへも配らない。
 */
export type SpeakDrawnEvent = { readonly kind: "speak-drawn" }
