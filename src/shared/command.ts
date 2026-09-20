// ブラウザからサーバへ送るコマンド。**書き込みの経路なので zod のスキーマが正典**で、
// 型は `z.infer` で得る（2026-09-13 決定。docs/design.md 4.3）。
//
// 検証するのは境界（WebSocket の受け口。src/server/adapter/session-socket.ts）で1回だけ。中では検証済みの型を使う。
//
// **依頼の文面（`text`）は会話の内容そのもの。** 検証に落ちたときの理由に文面を含めない
// （docs/coding-standards.md「会話内容の扱い」。理由の定型文は src/shared/frame.ts）。

import { z } from "zod"

import { isCharacterPackName, MAX_CHARACTER_PACK_NAME_LENGTH } from "./character.ts"
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
 * 許可モードの値の全体。**この一覧は shared に1つだけ置く**（docs/design.md 4.3）。
 * SDK の `PermissionMode` と同じ値であることは core 側のテスト
 * （test/server/adapter/sdk-driver.test.ts）が型で守る。画面に出す日本語ラベルは描く側が持つ。
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
 * （2026-09-11 実測で3語、2026-09-17 に `fable` を実測で追加）。フルネーム
 * （`claude-opus-4-1` のような値）は渡さない。
 */
export const MODEL_ALIASES = ["opus", "sonnet", "haiku", "fable"] as const

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
 * 立ち絵1枚の data URL。**大きさと種類はここで見る**（`src/shared/portrait-image.ts`。
 * 受け取るのは `.svg` / `.png` / `.gif` の3つだけ）。
 *
 * 文字列のまま持ち、`{ format, base64 }` へのほどきは書き込む側（`src/server/adapter/character-edit.ts`）が
 * 同じ `parsePortraitImage` で行う。**zod の `transform` で形を変えない**のは、ブラウザ側が
 * 送るときの型（`ClientCommand`）が受け取ったあとの形にすり替わってしまうため。
 */
const portraitDataUrlSchema = z
  .string()
  .max(MAX_PORTRAIT_DATA_URL_LENGTH)
  .refine((value) => parsePortraitImage(value) !== undefined)

/** 差し色（`<input type="color">` が渡す形）。**16進の値そのものはここに書かない。** */
const accentColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

/**
 * **新しく作る**パックの名前。ここだけは受け取った文字列がディレクトリ名になるので、
 * 切り替え（`switch-character`）の「長さだけ」より厳しく見る
 * （`src/shared/character.ts` の {@link isCharacterPackName}。パスの区切りと `..` を
 * 名前として通さない）。
 */
const newCharacterPackNameSchema = z.string().refine(isCharacterPackName)

const expressionSchema = z.custom<Expression>(
  (value) => typeof value === "string" && isExpression(value),
)

/**
 * 立ち絵を**消せる**表情。`default` はここで弾かれる（必須の1つ。
 * `src/shared/expression.ts` の `REQUIRED_EXPRESSIONS`）。
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
  /**
   * 雑談モードへ入る／出る（`docs/requirements.md` 4.9）。**`switch-character` と同じく
   * 駆動の起こし直し**になる（`systemPrompt` はセッションを起こすときに固定されるので、
   * レポートの記法を外すには起こし直すしかない）。
   */
  z.object({
    type: z.literal("set-chat-mode"),
    commandId: commandIdSchema,
    chat: z.boolean(),
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
  z.object({
    type: z.literal("create-character"),
    commandId: commandIdSchema,
    name: newCharacterPackNameSchema,
    // **必須の1つ（`REQUIRED_EXPRESSIONS`）をここで required にする**ので、立ち絵が無いパックは
    // 書き込む側まで届かない（`docs/design.md` 7.1・`characters/README.md`）。
    portraits: z.object({ default: portraitDataUrlSchema }),
    accent: accentColorSchema,
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

/**
 * 新しいキャラクターパックを作るコマンド。**これも駆動には渡らない**（書いたあと、選択肢の
 * 増えた `character-changed` を流し直すだけ。**作った直後に切り替えはしない** —
 * 切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない。
 * `docs/design.md` 7.1）。
 */
export type CharacterCreateCommand = Extract<ClientCommand, { readonly type: "create-character" }>

/** 駆動へそのまま渡すコマンド（起こし直しと見た目の編集はサーバ側で捌くので外れる）。 */
export type DriverCommand = Exclude<
  ClientCommand,
  | CharacterEditCommand
  | CharacterCreateCommand
  | { readonly type: "switch-character" }
  | { readonly type: "set-chat-mode" }
>

/** 見た目の編集のコマンドかどうか（`src/server/core/session-manager.ts` の分岐で使う）。 */
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
