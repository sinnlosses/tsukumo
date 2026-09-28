// コマンド（ブラウザからサーバへの書き込みの手続き）の共通の語彙。
// 手続きごとの形（入力と断る条件）は機能ごとの契約が持ち、ここは全部の契約が使うものだけを置く。
// 断る条件の `meta` の形・断ったときのエラー・モデルや許可モードの値の一覧がそれにあたる。

import { type AnyContractProcedure, type InferSchemaOutput, oc } from "@orpc/contract"
import { z } from "zod"

import type { FRAME_ERROR_REASON } from "./frame.ts"

/** 許可モードの値の全体。SDK の `PermissionMode` と同じ値に揃える（テストが型で守る）。 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "auto",
  "plan",
  "bypassPermissions",
] as const

export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * `setModel` に渡すモデルのエイリアス。Claude Code 本体はこの4語を受け付ける（実測）。
 * フルネーム（`claude-opus-4-1` のような値）は渡さない。
 */
export const MODEL_ALIASES = ["opus", "sonnet", "haiku", "fable"] as const

export type ModelAlias = (typeof MODEL_ALIASES)[number]

/** effort の段。SDK の `EffortLevel` と同じ5語（実測）。 */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

/** 外から届いた文字列が {@link PERMISSION_MODES} のいずれかかどうかを検証する。 */
export function isPermissionMode(value: string): value is PermissionMode {
  return PERMISSION_MODES.some((mode) => mode === value)
}

/** 外から届いた文字列が {@link MODEL_ALIASES} のいずれかかどうかを検証する。 */
export function isModelAlias(value: string): value is ModelAlias {
  return MODEL_ALIASES.some((alias) => alias === value)
}

/** 外から届いた文字列が {@link EFFORT_LEVELS} のいずれかかどうかを検証する。 */
export function isEffortLevel(value: string): value is EffortLevel {
  return EFFORT_LEVELS.some((level) => level === value)
}

/** 断るときに返す定型文（`FRAME_ERROR_REASON` の値のどれか）。 */
export type CommandRefusalReason = (typeof FRAME_ERROR_REASON)[keyof typeof FRAME_ERROR_REASON]

/**
 * 断る条件（契約の `meta`）。値は `false`（断らない）か、断るときの理由。
 * 見る順は `chatOnly`（雑談の外なら断る）→ `idleTurn`（ターン中なら断る）で、見るのは `commandGuard` の1箇所。
 */
export type CommandMeta = {
  readonly chatOnly: false | CommandRefusalReason
  readonly idleTurn: false | CommandRefusalReason
}

/** 断らない `meta`（ほとんどのコマンドはこれ）。 */
export const NO_COMMAND_REFUSAL = { chatOnly: false, idleTurn: false } satisfies CommandMeta

/**
 * コマンドを受け付けなかったときのエラー（`REFUSED`）。理由は定型文だけで、届いた値を混ぜない。
 * 投げる側はこの表から作ったエラーの作り手（`errors.REFUSED`）で投げる。
 * `status` が表と食い違うと、契約に無いエラー（`defined: false`・500）として届くため。
 */
export const COMMAND_ERRORS = {
  REFUSED: { status: 409, data: z.object({ reason: z.string() }) },
}

/** 全部のコマンドの契約の土台。契約はこれに入力と（断るものだけ）`meta` を足して書く。 */
export const commandBase = oc.$meta<CommandMeta>(NO_COMMAND_REFUSAL).errors(COMMAND_ERRORS)

/** 機能ごとのコマンドの契約（手続きの名前 → 契約）。 */
export type CommandContract = { readonly [name: string]: AnyContractProcedure }

/** 契約から、受け手が受け取る検証済みの入力の型を手続きごとに導く（zod の `default` を埋めたあとの形）。 */
export type CommandInputs<T extends CommandContract> = {
  readonly [K in keyof T]: InferSchemaOutput<T[K]["~orpc"]["inputSchema"]>
}
