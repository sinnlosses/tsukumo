// コマンド（ブラウザからサーバへの書き込みの手続き。`docs/glossary.md`「コマンド」）の共通の語彙。
// **手続きごとの形（入力と断る条件）は機能ごとの契約 `src/shared/contract/<機能>.ts`** が持ち、
// ここは全部の契約が使うもの——断る条件の `meta` の形・断ったときのエラー・モデルや許可モードの
// 値の一覧——だけを置く（`docs/design.md` 2章「コマンドの受け手と手続きの置き方」）。
//
// 検証するのは境界（`/ws` の手続きの受け口。`src/server/view-server/adapter/session-socket.ts`）で
// 1回だけ。中では検証済みの型を使う。
//
// **依頼の文面（`text`）は会話の内容そのもの。** 検証に落ちたときの理由に文面を含めない
// （docs/coding-standards.md「会話内容の扱い」。断る理由の定型文は src/shared/frame.ts）。

import { type AnyContractProcedure, type InferSchemaOutput, oc } from "@orpc/contract"
import { z } from "zod"

import { type FRAME_ERROR_REASON } from "./frame.ts"

/**
 * 許可モードの値の全体。**この一覧は shared に1つだけ置く**（docs/design.md 4.3）。
 * SDK の `PermissionMode` と同じ値であることは core 側のテスト
 * （test/server/session-driver/adapter/sdk-driver.test.ts）が型で守る。画面に出す日本語ラベルは描く側が持つ。
 */
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "auto",
  "plan",
  "bypassPermissions",
] as const

export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * `setModel` に渡すモデルのエイリアス。Claude Code 本体はこの4語を受け付ける
 * （実測で3語、その後 `fable` を実測で追加）。フルネーム
 * （`claude-opus-4-1` のような値）は渡さない。
 */
export const MODEL_ALIASES = ["opus", "sonnet", "haiku", "fable"] as const

export type ModelAlias = (typeof MODEL_ALIASES)[number]

/**
 * effort の段（`docs/requirements.md` 4.1）。SDK の `EffortLevel` と同じ5語（実測は
 * `docs/history/decision.md`「effort の途中変更と読み取りが成り立った実測」）。**送るときの
 * 一覧はここだけ**——読み取った値の検証も同じ一覧で行う（`src/server/session-driver/adapter/sdk-driver.ts` の
 * `stopHooks`）。
 */
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
 * 断る条件（契約の `meta`）。値は `false`（断らない）か、断るときの理由。**条件と理由を同じ所に
 * 書く**。見る順は `chatOnly`（雑談の外なら断る）→ `idleTurn`（ターン中なら断る）で、見るのは
 * `src/server/view-server/adapter/rpc-guard.ts` の1箇所。
 */
export type CommandMeta = {
  readonly chatOnly: false | CommandRefusalReason
  readonly idleTurn: false | CommandRefusalReason
}

/** 断らない `meta`（ほとんどのコマンドはこれ）。 */
export const NO_COMMAND_REFUSAL = { chatOnly: false, idleTurn: false } satisfies CommandMeta

/**
 * コマンドを受け付けなかったときのエラー（`REFUSED`）。**理由は定型文だけ**で、届いた値を混ぜない。
 * 投げる側（手続きと `rpc-guard.ts` の門）はこの表から作ったエラーの作り手（`errors.REFUSED`）で
 * 投げる——`status` が表と食い違うと、契約に無いエラー（`defined: false`・500）として届くため。
 */
export const COMMAND_ERRORS = {
  REFUSED: { status: 409, data: z.object({ reason: z.string() }) },
}

/**
 * 全部のコマンドの契約の土台。**断る条件の既定（断らない）と、断ったときのエラーを持つ**ので、
 * 契約はこれに入力と（断るものだけ）`meta` を足して書く。
 */
export const commandBase = oc.$meta<CommandMeta>(NO_COMMAND_REFUSAL).errors(COMMAND_ERRORS)

/** 機能ごとのコマンドの契約（手続きの名前 → 契約）。 */
export type CommandContract = { readonly [name: string]: AnyContractProcedure }

/**
 * 契約から、受け手が受け取る**検証済みの**入力の型を手続きごとに導く（zod の `default` を
 * 埋めたあとの形）。機能の `core` の表はこの型で行を書く。
 */
export type CommandInputs<T extends CommandContract> = {
  readonly [K in keyof T]: InferSchemaOutput<T[K]["~orpc"]["inputSchema"]>
}
