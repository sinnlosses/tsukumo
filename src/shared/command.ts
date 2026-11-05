// コマンド（ブラウザからサーバへの書き込みの手続き）の共通の語彙。
// 手続きごとの形（入力と断る条件）は機能ごとの契約が持ち、ここは全部の契約が使うものだけを置く。
// 断る条件の `meta` の形・断ったときのエラーがそれにあたる。
// 実行設定の値の語彙（許可モード・モデル・effort）は `session/` が持つ。

import { type AnyContractProcedure, type InferSchemaOutput, oc } from "@orpc/contract"
import { z } from "zod"

import { FRAME_ERROR_REASON } from "./frame-error-reason.ts"

/** 断るときに返す定型文（`FRAME_ERROR_REASON` の値のどれか）。 */
export type CommandRefusalReason = (typeof FRAME_ERROR_REASON)[keyof typeof FRAME_ERROR_REASON]

function isCommandRefusalReason(value: unknown): value is CommandRefusalReason {
  return Object.values(FRAME_ERROR_REASON).some((reason) => reason === value)
}

/**
 * 断る条件（契約の `meta`）。値は `false`（断らない）か、断るときの理由。
 * 見る順は `chatOnly`（雑談の外なら断る）→ `idleTurn`（ターン中なら断る）で、見るのは `commandGuard` の1箇所。
 * `restarts` が真のコマンドは駆動を起こし直すので、`idleTurn` の条件が「ターン中」でなく `restartRefused`（委譲先が動いている間も含む）になる。
 */
export type CommandMeta = {
  readonly chatOnly: false | CommandRefusalReason
  readonly idleTurn: false | CommandRefusalReason
  readonly restarts: boolean
}

/** 断らない `meta`（ほとんどのコマンドはこれ）。 */
export const NO_COMMAND_REFUSAL = {
  chatOnly: false,
  idleTurn: false,
  restarts: false,
} satisfies CommandMeta

/**
 * コマンドを受け付けなかったときのエラー（`REFUSED`）。理由は定型文だけで、届いた値を混ぜない。
 * 投げる側はこの表から作ったエラーの作り手（`errors.REFUSED`）で投げる。
 * `status` が表と食い違うと、契約に無いエラー（`defined: false`・500）として届くため。
 */
export const COMMAND_ERRORS = {
  REFUSED: {
    status: 409,
    data: z.object({ reason: z.custom<CommandRefusalReason>(isCommandRefusalReason) }),
  },
}

/** 全部のコマンドの契約の土台。契約はこれに入力と（断るものだけ）`meta` を足して書く。 */
export const commandBase = oc.$meta<CommandMeta>(NO_COMMAND_REFUSAL).errors(COMMAND_ERRORS)

/** 機能ごとのコマンドの契約（手続きの名前 → 契約）。 */
export type CommandContract = { readonly [name: string]: AnyContractProcedure }

/** 契約から、受け手が受け取る検証済みの入力の型を手続きごとに導く（zod の `default` を埋めたあとの形）。 */
export type CommandInputs<T extends CommandContract> = {
  readonly [K in keyof T]: InferSchemaOutput<T[K]["~orpc"]["inputSchema"]>
}
