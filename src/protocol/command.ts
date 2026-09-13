// ブラウザからサーバへ送るコマンド。**書き込みの経路なので zod のスキーマが正典**で、
// 型は `z.infer` で得る（2026-09-13 決定。docs/design.md 4.3）。
//
// 検証するのは境界（WebSocket の受け口。src/core/server.ts）で1回だけ。中では検証済みの型を使う。
//
// **依頼の文面（`text`）は会話の内容そのもの。** 検証に落ちたときの理由に文面を含めない
// （docs/coding-standards.md「会話内容の扱い」。理由の定型文は src/protocol/frame.ts）。

import { z } from "zod"

import { answerSchema } from "./pending-ask.ts"

/**
 * 依頼として送れる文面の上限。送信のための素朴な上限であって、秘匿・検閲のためではない
 * （旧の `POST /api/prompt` の `MAX_DISPATCH_TEXT_LENGTH` と同じ値をここへ移した）。
 */
export const MAX_PROMPT_TEXT_LENGTH = 20_000

/**
 * 許可モードの値の全体。**この一覧は protocol に1つだけ置く**（docs/design.md 4.3）。
 * SDK の `PermissionMode` と同じ値であることは core 側のテスト
 * （test/core/session-driver.test.ts）が型で守る。画面に出す日本語ラベルは描く側が持つ。
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
 * `setModel` に渡すモデルのエイリアス。Claude Code 本体はこの3語を受け付ける
 * （2026-09-11 実測）。フルネーム（`claude-opus-4-1` のような値）は渡さない。
 */
export const MODEL_ALIASES = ["opus", "sonnet", "haiku"] as const

export type ModelAlias = (typeof MODEL_ALIASES)[number]

/** 外から届いた文字列が {@link PERMISSION_MODES} のいずれかかどうかを検証する。 */
export function isPermissionMode(value: string): value is PermissionMode {
  return PERMISSION_MODES.some((mode) => mode === value)
}

/** 外から届いた文字列が {@link MODEL_ALIASES} のいずれかかどうかを検証する。 */
export function isModelAlias(value: string): value is ModelAlias {
  return MODEL_ALIASES.some((alias) => alias === value)
}

/**
 * ブラウザが作る、コマンド1件の識別子（`crypto.randomUUID()`）。**`error` フレームの
 * 突き合わせにだけ使う**ので、サーバはこれを状態に持たない。
 */
const commandIdSchema = z.string().min(1).max(200)

/**
 * ブラウザ → サーバのコマンド。`switch-character`（段8）と `new-session`（段9）は
 * まだ足していない（docs/design.md 4.3）。
 */
export const clientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("prompt"),
    commandId: commandIdSchema,
    text: z
      .string()
      .max(MAX_PROMPT_TEXT_LENGTH)
      .refine((text) => text.trim() !== ""),
  }),
  z.object({ type: z.literal("interrupt"), commandId: commandIdSchema }),
  z.object({
    type: z.literal("answer"),
    commandId: commandIdSchema,
    id: z.string().min(1),
    answer: answerSchema,
  }),
  z.object({
    type: z.literal("set-model"),
    commandId: commandIdSchema,
    model: z.enum(MODEL_ALIASES),
  }),
  z.object({
    type: z.literal("set-permission-mode"),
    commandId: commandIdSchema,
    mode: z.enum(PERMISSION_MODES),
  }),
])

export type ClientCommand = z.infer<typeof clientCommandSchema>

/**
 * 届いた値をコマンドとして検証する。形が合わないときは undefined を返す
 * （**理由に届いた値を含めない**。呼び出し側は定型文の `error` フレームを返す）。
 */
export function parseClientCommand(value: unknown): ClientCommand | undefined {
  const parsed = clientCommandSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
