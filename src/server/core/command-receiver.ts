// コマンドの受け手の行の型（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。**機能ごとの
// 表（`<機能>/core/<機能>-command.ts`）が書く行の形**と、断る条件の2列だけを持つ。
//
// 行の種類のうち `session`（セッションの口を受け取るもの）はここに無い——型が
// `session/core/command-dispatch.ts` にあるので、葉の機能の表からは書けない。断る条件を見るのも、
// 行を呼ぶのもそちら1箇所で、ここは形だけ。

import { type ClientCommand } from "../../shared/command.ts"
import { type FRAME_ERROR_REASON } from "../../shared/frame.ts"
import { type SessionEvent } from "../../shared/session-event.ts"

/** 断るときに返す定型文（`FRAME_ERROR_REASON` の値のどれか）。 */
export type CommandRefusalReason = (typeof FRAME_ERROR_REASON)[keyof typeof FRAME_ERROR_REASON]

/**
 * 断る条件の2列。値は `false`（断らない）か、断るときの理由。**条件と理由を同じ行に書く**。
 * 見る順は `chatOnly`（雑談の外なら断る）→ `idleTurn`（ターン中なら断る）。
 */
export type CommandGuard = {
  readonly chatOnly: false | CommandRefusalReason
  readonly idleTurn: false | CommandRefusalReason
}

/** コマンドの種類。 */
export type CommandType = ClientCommand["type"]

/**
 * 種類 → コマンドの写像。**表の型をこの写像の添字で書く**ので、配る側は種類を型引数にしたまま
 * 行とコマンドを対で扱える（種類ごとの合併を開かずに済む）。
 */
export type CommandByType = { readonly [T in CommandType]: Extract<ClientCommand, { type: T }> }

/**
 * 書き込み口を呼び、返ったイベントを流す行。`undefined` が返ったとき・投げたときは `failure` で断る。
 * イベントを流すのは配る側で、行は流し方を知らない。
 */
export type WriteReceiver<C> = CommandGuard & {
  readonly kind: "write"
  readonly receive: (command: C) => SessionEvent | undefined | Promise<SessionEvent | undefined>
  readonly failure: CommandRefusalReason
}

/** 外へ頼むだけの行（イベントを流さない）。`false` が返ったとき・投げたときは `failure` で断る。 */
export type CallReceiver<C> = CommandGuard & {
  readonly kind: "call"
  readonly receive: (command: C) => Promise<boolean>
  readonly failure: CommandRefusalReason
}

/** 葉の機能が書ける行（`write` か `call`）。 */
export type FeatureReceiver<C> = WriteReceiver<C> | CallReceiver<C>

/** 機能の表。その機能が受ける種類ごとに1行。 */
export type FeatureCommandTable<T extends CommandType> = {
  readonly [K in T]: FeatureReceiver<CommandByType[K]>
}

/** 断らない行の2列（ほとんどの行はこれ）。 */
export const NO_COMMAND_GUARD = { chatOnly: false, idleTurn: false } satisfies CommandGuard
