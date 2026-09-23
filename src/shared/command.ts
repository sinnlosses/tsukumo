// ブラウザからサーバへ送るコマンド。**書き込みの経路なので zod のスキーマが正典**で、
// 型は `z.infer` で得る（docs/design.md 4.3）。
//
// 検証するのは境界（WebSocket の受け口。src/server/adapter/session-socket.ts）で1回だけ。中では検証済みの型を使う。
//
// **依頼の文面（`text`）は会話の内容そのもの。** 検証に落ちたときの理由に文面を含めない
// （docs/coding-standards.md「会話内容の扱い」。理由の定型文は src/shared/frame.ts）。

import { z } from "zod"

import { MAX_BACKGROUND_DATA_URL_LENGTH, parseBackgroundImage } from "./character-background.ts"
import { type AccentTarget, isAccentTarget } from "./character-definition.ts"
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
import { MAX_REMEMBERED_LINE_LENGTH } from "./persona-memory.ts"
import { MAX_PORTRAIT_DATA_URL_LENGTH, parsePortraitImage } from "./portrait-image.ts"
import {
  MAX_PROMPT_IMAGE_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
  parsePromptImage,
  parsePromptImageThumbnail,
} from "./prompt-image.ts"
import { SESSION_DEFAULT_PERMISSION_MODES } from "./session-default.ts"

/**
 * 依頼として送れる文面の上限。送信のための素朴な上限であって、秘匿・検閲のためではない
 * （旧の入力欄の送信経路にあった `MAX_DISPATCH_TEXT_LENGTH` と同じ値をここへ移した）。
 */
export const MAX_PROMPT_TEXT_LENGTH = 20_000

/**
 * 画面から選び直せるセッションのIDの上限。**UUID を通せる素朴な上限**であって、形の検査では
 * ない（知らないIDは起こす側が新規に倒すので、ここで形まで縛らない）。
 */
const MAX_SESSION_ID_LENGTH = 200

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
 * （実測で3語、その後 `fable` を実測で追加）。フルネーム
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

/**
 * 背景1枚の data URL（`docs/screen-design.md` 13.8）。**受け取るのは `.png` / `.jpg` / `.webp` の
 * 3つだけ**（`src/shared/character-background.ts`。`.gif` は入れない — 動く背景は読む面の隣で
 * 気が散る）。立ち絵と同じく文字列のまま持ち、ほどくのは書き込む側。
 */
const backgroundDataUrlSchema = z
  .string()
  .max(MAX_BACKGROUND_DATA_URL_LENGTH)
  .refine((value) => parseBackgroundImage(value) !== undefined)

/**
 * 依頼に添える画像1枚（`docs/requirements.md` 4.10）。**原寸と控えの対**で、大きさと種類は
 * `src/shared/prompt-image.ts` が見る（受け取るのは `.png` / `.jpg` / `.gif` / `.webp` の4つ
 * だけ。**`.svg` は API が取らないので渡せない**）。
 *
 * **上限が2つあるのは、2つの寿命が違うから**（原寸は送った時点で手放し、記録に残るのは
 * 控えだけ）。立ち絵と同じく文字列のまま持ち、`{ mediaType, base64 }` へのほどきは渡す側
 * （`src/server/adapter/sdk-driver.ts`）が同じ関数で行う。
 */
const promptImageSchema = z.object({
  full: z
    .string()
    .max(MAX_PROMPT_IMAGE_DATA_URL_LENGTH)
    .refine((value) => parsePromptImage(value) !== undefined),
  thumbnail: z
    .string()
    .max(MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH)
    .refine((value) => parsePromptImageThumbnail(value) !== undefined),
})

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

/** 画面の差し色（`accent` / `chatAccent`）のうちどちらを差すか。`src/shared/character-definition.ts`。 */
const accentTargetSchema = z.custom<AccentTarget>(
  (value) => typeof value === "string" && isAccentTarget(value),
)

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
    // **添えた画像**（`docs/requirements.md` 4.10）。1枚も無いのが普通なので、field ごと
    // 省いた形も受け取って空に畳む（画像を知らない送り手から届いても弾かない）。
    images: z.array(promptImageSchema).max(MAX_PROMPT_IMAGES).readonly().default([]),
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
   * 雑談モードへ入る／出る（`docs/chat-mode.md` 4.9）。**`switch-character` と同じく
   * 駆動の起こし直し**になる（`systemPrompt` はセッションを起こすときに固定されるので、
   * レポートの記法を外すには起こし直すしかない）。
   */
  z.object({
    type: z.literal("set-chat-mode"),
    commandId: commandIdSchema,
    chat: z.boolean(),
  }),
  /**
   * キャラクターから話しかけてもらう（`docs/screen-design.md` 13.7）。**文面はここを通らない** —
   * 送る一言は `src/server/core/chat-nudge.ts` が持ち、押した事実だけが届く（原則4。話題は
   * tsukumo が列挙しない）。**送った文面はログにも記録にも残さない**ので、
   * `prompt` とは別のコマンドにしてある。
   */
  z.object({ type: z.literal("nudge"), commandId: commandIdSchema }),
  /**
   * 続きから始めるセッションを画面から選び直す（`docs/requirements.md` 4.8）。
   * **`switch-character` と同じく駆動の起こし直し**で、変わるのは「どの transcript の続きから
   * 始めるか」だけ（キャラクターも雑談かどうかも、いま出しているまま）。**選べるのは
   * `sessions-changed` で届いた一覧の中身**（同じパック・同じモードの、目印違い）なので、
   * ここで見るのは長さだけにして、知らないIDは起こす側（`session-launch`）が新規に倒す。
   */
  z.object({
    type: z.literal("switch-session"),
    commandId: commandIdSchema,
    sessionId: z.string().min(1).max(MAX_SESSION_ID_LENGTH),
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
  /**
   * 画面の差し色（`accent` / `chatAccent`）を差す（`docs/screen-design.md` 13.6）。**`target` で
   * どちらを差すかを分ける**（`set-outfit-accent` が衣装を引数で分けているのに揃える。型を
   * 2つに割らない）。
   */
  z.object({
    type: z.literal("set-accent"),
    commandId: commandIdSchema,
    target: accentTargetSchema,
    color: accentColorSchema,
  }),
  /**
   * 雑談の差し色（`chatAccent`）を消し、雑談中も仕事の差し色（`accent`）と同じに戻す
   * （`docs/screen-design.md` 13.6「仕事と同じにする」）。**`accent` を消す口は無い**
   * （`src/shared/character-definition.ts` の `definitionWithoutChatAccent`）。
   */
  z.object({ type: z.literal("clear-chat-accent"), commandId: commandIdSchema }),
  /**
   * キャラビューに敷く背景を差し替える／消す（`docs/screen-design.md` 13.8）。**覆いの濃さは
   * 画面から変えない**ので、受け取るのは素材だけ（濃さは定義ファイルを手で直す）。
   */
  z.object({
    type: z.literal("set-background"),
    commandId: commandIdSchema,
    image: backgroundDataUrlSchema,
  }),
  z.object({ type: z.literal("clear-background"), commandId: commandIdSchema }),
  /**
   * 新しいセッションの既定（モデル・許可モード）を覚える（`docs/screen-design.md` 13.6。帯の右端の
   * 歯車）。**いま動いているセッションには効かない** — 効くのは次に起こすときからで、
   * 帯の `set-model` / `set-permission-mode`（セッション限り）とは別の口にしてある。
   *
   * **2つを1つのコマンドで運ぶ**のは、覚え先（`~/.tsukumo/state.json`）が1組で書き換わる
   * ものだから（片方だけ覚えている状態を作らない）。**「全部許す」は選択肢に無い**ので、
   * 届いても検証で落ちる（`SESSION_DEFAULT_PERMISSION_MODES`。`src/shared/session-default.ts`）。
   */
  z.object({
    type: z.literal("set-session-default"),
    commandId: commandIdSchema,
    model: z.enum(MODEL_ALIASES),
    permissionMode: z.enum(SESSION_DEFAULT_PERMISSION_MODES),
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
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消す（`docs/design.md` 7.1「1行だけ
   * 忘れる」）。**指し方はキャラクター自身の `forget` ツールと同じ完全一致**——チップに出した
   * 文面（`- ` を外した1行）をそのまま送る。書き込みは
   * `src/server/adapter/persona-memory.ts` の `forgetRememberedLineFromScreen` を通し、
   * 1ターン1行の上限（モデルの `forget` の上限）は掛からない。
   */
  z.object({
    type: z.literal("forget-remembered-line"),
    commandId: commandIdSchema,
    line: z.string().min(1).max(MAX_REMEMBERED_LINE_LENGTH),
  }),
])

export type ClientCommand = z.infer<typeof clientCommandSchema>

/**
 * いま出しているキャラクターパックの見た目（立ち絵・差し色・背景）を変えるコマンド。**どれも
 * 駆動には渡らない**（書き込みと `character-changed` の流し直しで済むので、セッションは
 * 起こし直さない。`docs/design.md` 7.1）。
 */
export type CharacterEditCommand = Extract<
  ClientCommand,
  {
    readonly type:
      | "set-portrait"
      | "clear-portrait"
      | "set-outfit-accent"
      | "set-accent"
      | "clear-chat-accent"
      | "set-background"
      | "clear-background"
  }
>

/**
 * 新しいキャラクターパックを作るコマンド。**これも駆動には渡らない**（書いたあと、選択肢の
 * 増えた `character-changed` を流し直すだけ。**作った直後に切り替えはしない** —
 * 切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない。
 * `docs/design.md` 7.1）。
 */
export type CharacterCreateCommand = Extract<ClientCommand, { readonly type: "create-character" }>

/**
 * 駆動へそのまま渡すコマンド（起こし直しと見た目の編集はサーバ側で捌くので外れる。
 * `nudge` も文面をサーバ側が足すので外れる）。**`forget-remembered-line` も外れる** —
 * 書き込みと `remembered-lines-changed` の流し直しで済み、`editCharacter` と同じくセッションは
 * 起こし直さない（`docs/design.md` 7.1）。
 */
export type DriverCommand = Exclude<
  ClientCommand,
  | CharacterEditCommand
  | CharacterCreateCommand
  | { readonly type: "switch-character" }
  | { readonly type: "switch-session" }
  | { readonly type: "set-chat-mode" }
  | { readonly type: "nudge" }
  | { readonly type: "set-session-default" }
  | { readonly type: "forget-remembered-line" }
>

/** 見た目の編集のコマンドかどうか（`src/server/core/session-manager.ts` の分岐で使う）。 */
export function isCharacterEditCommand(command: ClientCommand): command is CharacterEditCommand {
  return CHARACTER_EDIT_COMMAND_TYPES.some((type) => type === command.type)
}

const CHARACTER_EDIT_COMMAND_TYPES = [
  "set-portrait",
  "clear-portrait",
  "set-outfit-accent",
  "set-accent",
  "clear-chat-accent",
  "set-background",
  "clear-background",
] as const

/**
 * 届いた値をコマンドとして検証する。形が合わないときは undefined を返す
 * （**理由に届いた値を含めない**。呼び出し側は定型文の `error` フレームを返す）。
 */
export function parseClientCommand(value: unknown): ClientCommand | undefined {
  const parsed = clientCommandSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
