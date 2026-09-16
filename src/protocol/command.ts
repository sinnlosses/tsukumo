// ブラウザからサーバへ送るコマンド。**書き込みの経路なので zod のスキーマが正典**で、
// 型は `z.infer` で得る（2026-09-13 決定。docs/design.md 4.3）。
//
// 検証するのは境界（WebSocket の受け口。src/core/server.ts）で1回だけ。中では検証済みの型を使う。
//
// **依頼の文面（`text`）は会話の内容そのもの。** 検証に落ちたときの理由に文面を含めない
// （docs/coding-standards.md「会話内容の扱い」。理由の定型文は src/protocol/frame.ts）。

import { z } from "zod"

import {
  type Expression,
  isExpression,
  isOutfit,
  isRemovableExpression,
  type Outfit,
  type RemovableExpression,
} from "./expression.ts"
import { answerSchema } from "./pending-ask.ts"
import { MAX_PORTRAIT_DATA_URL_LENGTH, parsePortraitImage } from "./portrait-image.ts"

/**
 * 依頼として送れる文面の上限。送信のための素朴な上限であって、秘匿・検閲のためではない
 * （旧の入力欄の送信経路にあった `MAX_DISPATCH_TEXT_LENGTH` と同じ値をここへ移した）。
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
 * キャラクターパックの名前（`characters/<name>` のディレクトリ名）として受け付ける長さの上限。
 * **ここは長さしか見ない。** 名前をパスとして組み立てず、受け取った側（`src/cli.ts`）が
 * 一覧にある名前とだけ突き合わせるので、`..` のような値は自然に「見つからない」に落ちる。
 */
const MAX_CHARACTER_PACK_NAME_LENGTH = 200

/**
 * ブラウザが作る、コマンド1件の識別子（`crypto.randomUUID()`）。**`error` フレームの
 * 突き合わせにだけ使う**ので、サーバはこれを状態に持たない。
 */
const commandIdSchema = z.string().min(1).max(200)

/**
 * 立ち絵1枚の data URL。**大きさと種類はここで見る**（`src/protocol/portrait-image.ts`。
 * 受け取るのは `.svg` / `.png` / `.gif` の3つだけ）。
 *
 * 文字列のまま持ち、`{ format, base64 }` へのほどきは書き込む側（`src/core/character-edit.ts`）が
 * 同じ `parsePortraitImage` で行う。**zod の `transform` で形を変えない**のは、ブラウザ側が
 * 送るときの型（`ClientCommand`）が受け取ったあとの形にすり替わってしまうため。
 */
const portraitDataUrlSchema = z
  .string()
  .max(MAX_PORTRAIT_DATA_URL_LENGTH)
  .refine((value) => parsePortraitImage(value) !== undefined)

/** 差し色（`<input type="color">` が渡す形）。**16進の値そのものはここに書かない。** */
const accentColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

const expressionSchema = z.custom<Expression>(
  (value) => typeof value === "string" && isExpression(value),
)

/**
 * 立ち絵を**消せる**表情。`default` と `working` はここで弾かれる（必須の2つ。
 * `src/protocol/expression.ts` の `REQUIRED_EXPRESSIONS`）。
 */
const removableExpressionSchema = z.custom<RemovableExpression>(
  (value) => typeof value === "string" && isRemovableExpression(value),
)

const outfitSchema = z.custom<Outfit>((value) => typeof value === "string" && isOutfit(value))

/**
 * ブラウザ → サーバのコマンド。`new-session`（docs/design.md 8章）はまだ足していない。
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
  z.object({
    type: z.literal("switch-character"),
    commandId: commandIdSchema,
    name: z.string().min(1).max(MAX_CHARACTER_PACK_NAME_LENGTH),
  }),
  z.object({
    type: z.literal("set-portrait"),
    commandId: commandIdSchema,
    expression: expressionSchema,
    image: portraitDataUrlSchema,
  }),
  z.object({
    type: z.literal("clear-portrait"),
    commandId: commandIdSchema,
    expression: removableExpressionSchema,
  }),
  z.object({
    type: z.literal("set-outfit-accent"),
    commandId: commandIdSchema,
    outfit: outfitSchema,
    color: accentColorSchema,
  }),
])

export type ClientCommand = z.infer<typeof clientCommandSchema>

/**
 * いま出しているキャラクターパックの見た目（立ち絵・差し色）を変えるコマンド。**どれも
 * 駆動には渡らない**（書き込みと `character-changed` の流し直しで済むので、セッションは
 * 起こし直さない。`docs/design.md` 7.1）。
 */
export type CharacterEditCommand = Extract<
  ClientCommand,
  { readonly type: "set-portrait" | "clear-portrait" | "set-outfit-accent" }
>

/** 駆動へそのまま渡すコマンド（起こし直しと見た目の編集はサーバ側で捌くので外れる）。 */
export type DriverCommand = Exclude<
  ClientCommand,
  CharacterEditCommand | { readonly type: "switch-character" }
>

/** 見た目の編集のコマンドかどうか（`src/core/session-manager.ts` の分岐で使う）。 */
export function isCharacterEditCommand(command: ClientCommand): command is CharacterEditCommand {
  return CHARACTER_EDIT_COMMAND_TYPES.some((type) => type === command.type)
}

const CHARACTER_EDIT_COMMAND_TYPES = [
  "set-portrait",
  "clear-portrait",
  "set-outfit-accent",
] as const

/**
 * 届いた値をコマンドとして検証する。形が合わないときは undefined を返す
 * （**理由に届いた値を含めない**。呼び出し側は定型文の `error` フレームを返す）。
 */
export function parseClientCommand(value: unknown): ClientCommand | undefined {
  const parsed = clientCommandSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
