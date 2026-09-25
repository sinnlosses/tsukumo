// ブラウザからサーバへ送るコマンド。**書き込みの経路なので zod のスキーマが正典**で、
// 型は `z.infer` で得る（docs/design.md 4.3）。
//
// 検証するのは境界（WebSocket の受け口。src/server/view-server/adapter/session-socket.ts）で1回だけ。中では検証済みの型を使う。
//
// **依頼の文面（`text`）は会話の内容そのもの。** 検証に落ちたときの理由に文面を含めない
// （docs/coding-standards.md「会話内容の扱い」。理由の定型文は src/shared/frame.ts）。

import { z } from "zod"

import { MAX_BACKGROUND_DATA_URL_LENGTH, parseBackgroundImage } from "./character-background.ts"
import {
  type AccentTarget,
  isAccentTarget,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "./character-definition.ts"
import { MAX_FACE_DATA_URL_LENGTH, parseFaceImage } from "./character-face.ts"
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
import { USAGE_PROPOSAL_KINDS } from "./usage-review.ts"

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
 * 提案の対象（`UsageProposal.target`）の上限。**形の検査ではなく素朴な上限**——対象は
 * MCP ツール名・メモリファイルのパス・モデル名などで、パスがいちばん長くなりうるので
 * 余裕を見た値にしてある。
 */
const MAX_USAGE_PROPOSAL_TARGET_LENGTH = 1_000

/**
 * レポートから開く依頼のパスの上限。**形の検査ではなく素朴な上限**（実際に開けるかどうかは
 * git 管理下の一覧にあるかどうかで決まるので、ここでは長さだけを見る）。
 */
const MAX_OPEN_FILE_PATH_LENGTH = 1_000

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

/**
 * ブラウザが作る、コマンド1件の識別子（`crypto.randomUUID()`）。**`error` フレームの
 * 突き合わせにだけ使う**ので、サーバはこれを状態に持たない。
 */
const commandIdSchema = z.string().min(1).max(200)

/**
 * 立ち絵1枚の data URL。**大きさと種類はここで見る**（`src/shared/portrait-image.ts`。
 * 受け取るのは `.svg` / `.png` / `.gif` の3つだけ）。
 *
 * 文字列のまま持ち、`{ format, base64 }` へのほどきは書き込む側（`src/server/character-pack/adapter/character-edit.ts`）が
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
 * 帯の左端・一覧の丸・名乗りの大きな丸に出す顔1枚の data URL（`docs/screen-design.md` 13.9「顔」）。
 * **受け取るのは立ち絵と同じ `.svg` / `.png` / `.gif` の3つだけ**（`src/shared/character-face.ts`。
 * 立ち絵と同じ「キャラクターの絵」という素材の性質なので、写真が主な背景〔`.png` / `.jpg` /
 * `.webp`〕ではなく立ち絵に揃える）。
 */
const faceDataUrlSchema = z
  .string()
  .max(MAX_FACE_DATA_URL_LENGTH)
  .refine((value) => parseFaceImage(value) !== undefined)

/**
 * 依頼に添える画像1枚（`docs/requirements.md` 4.10）。**原寸と控えの対**で、大きさと種類は
 * `src/shared/prompt-image.ts` が見る（受け取るのは `.png` / `.jpg` / `.gif` / `.webp` の4つ
 * だけ。**`.svg` は API が取らないので渡せない**）。
 *
 * **上限が2つあるのは、2つの寿命が違うから**（原寸は送った時点で手放し、記録に残るのは
 * 控えだけ）。立ち絵と同じく文字列のまま持ち、`{ mediaType, base64 }` へのほどきは渡す側
 * （`src/server/session-driver/adapter/sdk-driver.ts`）が同じ関数で行う。
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

/**
 * 見た目の編集で**書き込む先の**パックの名前（`docs/design.md` 7.1）。**使用中を暗黙にしない**ので
 * 編集のコマンドはどれもこれを必須で持つ。形は作るときと同じ {@link isCharacterPackName} で見る
 * （書き込み先 `~/.tsukumo/characters/<name>/` のディレクトリ名になる値なので、切り替えの
 * 「長さだけ」より厳しくする）。**一覧にある名前かどうかは書き込む側が突き合わせる**
 * （`src/server/character-pack/adapter/character-edit.ts` の `editCharacterPack`）。
 */
const editedCharacterPackNameSchema = z.string().refine(isCharacterPackName)

/**
 * 表示名（`character.json` の `name`）。**空文字も通す** — 空なら書き込む側が id へ落とす
 * （`src/shared/character-definition.ts` の `definitionWithName`。`docs/design.md` 7.1）ので、
 * ここでは長さの素朴な上限だけを見る。ディレクトリ名になる {@link newCharacterPackNameSchema} /
 * {@link editedCharacterPackNameSchema} と違って文字種は縛らない（日本語も使える）。
 */
const characterNameSchema = z.string().max(MAX_CHARACTER_NAME_LENGTH)

/**
 * ひとことプロフィール（`character.json` の `tagline`）。**空文字も通す** — 空なら消したのと
 * 同じに畳む（`definitionWithTagline`）。
 */
const characterTaglineSchema = z.string().max(MAX_CHARACTER_TAGLINE_LENGTH)

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
  /**
   * effort を切り替える（`docs/screen-design.md` 13.9「動き方の操作子」）。**`set-model` と
   * 同じ形**——セッション限りで、サーバは `applyFlagSettings({ effortLevel })` で SDK へ渡す
   * だけ（`src/server/session-driver/adapter/sdk-driver.ts`）。**帯に表示する値はこのコマンドで送った値では
   * なく、hook 入力から読み取った値**（`effort-changed`。押した値へ先に倒さない。理由は
   * `docs/screen-design.md` 13.9「動き方の操作子」）。
   */
  z.object({
    type: z.literal("set-effort"),
    commandId: commandIdSchema,
    effort: z.enum(EFFORT_LEVELS),
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
   * 送る一言は `src/server/chat/core/chat-nudge.ts` が持ち、押した事実だけが届く（原則4。話題は
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
    pack: editedCharacterPackNameSchema,
    expression: expressionSchema,
    image: portraitDataUrlSchema,
  }),
  z.object({
    type: z.literal("clear-portrait"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
    expression: removableExpressionSchema,
  }),
  z.object({
    type: z.literal("set-outfit-accent"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
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
    pack: editedCharacterPackNameSchema,
    target: accentTargetSchema,
    color: accentColorSchema,
  }),
  /**
   * 雑談の差し色（`chatAccent`）を消し、雑談中も仕事の差し色（`accent`）と同じに戻す
   * （`docs/screen-design.md` 13.6「仕事と同じにする」）。**`accent` を消す口は無い**
   * （`src/shared/character-definition.ts` の `definitionWithoutChatAccent`）。
   */
  z.object({
    type: z.literal("clear-chat-accent"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
  }),
  /**
   * 名前とひとことプロフィールを変える（見本の「名前とプロフィールを変える」ボタン。画面側は
   * `docs/screen-design.md` 13.6）。**1つの画面のボタンから2つの欄をまとめて
   * 送る**ので、コマンドも1つにする
   * （`set-accent` の `target` のように分けるほど値の性質が離れていないため）。**どちらも
   * 空文字を通し、空なら書き込む側が畳む**（名前は id へ、ひとことは「無い」へ。
   * `src/shared/character-definition.ts` の `definitionWithName` / `definitionWithTagline`）。
   */
  z.object({
    type: z.literal("set-profile"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
    name: characterNameSchema,
    tagline: characterTaglineSchema,
  }),
  /**
   * キャラビューに敷く背景を差し替える／消す（`docs/screen-design.md` 13.8）。**覆いの濃さは
   * 画面から変えない**ので、受け取るのは素材だけ（濃さは定義ファイルを手で直す）。
   */
  z.object({
    type: z.literal("set-background"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
    image: backgroundDataUrlSchema,
  }),
  z.object({
    type: z.literal("clear-background"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
  }),
  /**
   * 帯の左端・一覧の丸・名乗りの大きな丸に出す顔を差し替える／外す（`docs/screen-design.md` 13.9「顔」）。
   * **`set-background` / `clear-background` と同じ形**（`pack` で書き込む先を指し、駆動には渡らない）。
   */
  z.object({
    type: z.literal("set-face"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
    image: faceDataUrlSchema,
  }),
  z.object({
    type: z.literal("clear-face"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
  }),
  /**
   * 新しいセッションの既定（モデル・effort・許可モード）を覚える（`docs/screen-design.md` 13.6。
   * 帯の右端の歯車）。**いま動いているセッションには効かない** — 効くのは次に起こすときからで、
   * 帯の `set-model` / `set-effort` / `set-permission-mode`（セッション限り）とは別の口にしてある。
   *
   * **3つを1つのコマンドで運ぶ**のは、覚え先（`~/.tsukumo/state.json`）が1組で書き換わる
   * ものだから（1つだけ覚えている状態を作らない）。**「全部許す」は選択肢に無い**ので、
   * 届いても検証で落ちる（`SESSION_DEFAULT_PERMISSION_MODES`。`src/shared/session-default.ts`）。
   * effort は除外する値が無いので `EFFORT_LEVELS` をそのまま受け付ける。
   */
  z.object({
    type: z.literal("set-session-default"),
    commandId: commandIdSchema,
    model: z.enum(MODEL_ALIASES),
    effort: z.enum(EFFORT_LEVELS),
    permissionMode: z.enum(SESSION_DEFAULT_PERMISSION_MODES),
  }),
  /**
   * 歯車の「訪問」のオン・オフ（`docs/screen-design.md` 13.6・13.9「設定の歯車」）。
   * **`set-session-default` と違い、いま動いているセッションに即座に効く**——ディスクには
   * 覚えないので、起こし直すと既定の「する」へ戻る（`src/server/session/core/session-manager.ts`）。
   */
  z.object({
    type: z.literal("set-visit-enabled"),
    commandId: commandIdSchema,
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal("create-character"),
    commandId: commandIdSchema,
    // **保存するフォルダの名前**（`docs/design.md` 7.1「新しく作るときの細部」）。作ったあとは
    // 変えない。
    id: newCharacterPackNameSchema,
    // **画面や吹き出しに出る名前。空なら id をそのまま使う**（`definitionWithName`）ので、
    // ディレクトリ名になる `id` と違って文字種は縛らない（`characterNameSchema`）。
    name: characterNameSchema,
    // **必須の1つ（`REQUIRED_EXPRESSIONS`）をここで required にする**ので、立ち絵が無いパックは
    // 書き込む側まで届かない（`docs/design.md` 7.1・`characters/README.md`）。
    portraits: z.object({ default: portraitDataUrlSchema }),
    // 画面の差し色（仕事・雑談の2つ）。**どちらも必須**——見本の作るダイアログが2色とも
    // 埋まった状態で出すのに揃える（`docs/design.md` 7.1）。作ったあとに片方だけ消したくなったら
    // `clear-chat-accent` で外せる。
    accent: accentColorSchema,
    chatAccent: accentColorSchema,
  }),
  /**
   * キャラクターパックを消す（`docs/design.md` 7.1「消すときの細部」）。**消すのはホームの版だけ**で、
   * 同梱のパックを画面で直したものなら同梱の版が一覧に戻る。名前は一覧と突き合わせて引くだけで、
   * 形は見た目の編集と同じ {@link isCharacterPackName} で見る。**id を打って確かめるのは画面の側**
   * で、サーバは名前を受けて消すだけ（使用中・ホームに無いパックは断る。
   * `src/server/character-pack/adapter/character-edit.ts` の `deleteCharacterPack`）。
   */
  z.object({
    type: z.literal("delete-character"),
    commandId: commandIdSchema,
    pack: editedCharacterPackNameSchema,
  }),
  /**
   * 雑談のサイドバー「覚えていること」の「編集」から1行消す（`docs/design.md` 7.1「1行だけ
   * 忘れる」）。**指し方はキャラクター自身の `forget` ツールと同じ完全一致**——チップに出した
   * 文面（`- ` を外した1行）をそのまま送る。書き込みは
   * `src/server/chat/adapter/persona-memory.ts` の `forgetRememberedLineFromScreen` を通し、
   * 1ターン1行の上限（モデルの `forget` の上限）は掛からない。
   */
  z.object({
    type: z.literal("forget-remembered-line"),
    commandId: commandIdSchema,
    line: z.string().min(1).max(MAX_REMEMBERED_LINE_LENGTH),
  }),
  /**
   * トークン消費の画面の結果の札から、提案を1件見送る。**識別子は種類と対象の組**
   * （`usageProposalKey`）——見出しや根拠の言い回しが変わっても同じ提案を指す。次の見直しでも
   * 出さない（`src/server/usage-review/core/usage-review-tool.ts` の `dismissedKeys`）。**取り消す口は無い**
   * （`docs/design.md`「見直しのツールと状態」）。
   */
  z.object({
    type: z.literal("dismiss-usage-proposal"),
    commandId: commandIdSchema,
    kind: z.enum(USAGE_PROPOSAL_KINDS),
    target: z.string().max(MAX_USAGE_PROPOSAL_TARGET_LENGTH),
  }),
  /**
   * レポートに書かれたパス（inline code・フェンスのファイル名・相対リンクの3か所。
   * `docs/display.md` 4.2「各表示物」）を Orca のエディタで開く。**`path` は cwd 相対で、
   * git 管理下の一覧にあるものだけを渡す**——ブラウザ側（`repository-link.tsx`）が
   * 描くときに一覧と照合して押せる部品にするが、**サーバ側でも同じ一覧と照合してから
   * `orca file open` を呼ぶ**（任意の文字列を外部コマンドへ渡さない。`src/session-start.ts`）。
   * **行番号は運ばない**（Orca に口が無い。表示の `:12` は残るが、開くのは裸のパスだけ）。
   */
  z.object({
    type: z.literal("open-file"),
    commandId: commandIdSchema,
    path: z.string().min(1).max(MAX_OPEN_FILE_PATH_LENGTH),
  }),
  /**
   * 成果の画面のボタン（と見開きの「この日を振り返る」）から送る、成果の振り返り
   * （`docs/glossary.md`「成果の振り返り」）。**画面は日付だけを送る**——依頼文は
   * session-manager がその日の成果を数え直して組む（`docs/design.md`「日記の受け取りと
   * 保存」「コマンドと依頼」）。`date` は `YYYY-MM-DD`。
   */
  z.object({
    type: z.literal("reflect-achievement"),
    commandId: commandIdSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
])

export type ClientCommand = z.infer<typeof clientCommandSchema>

/**
 * 見た目の編集のコマンドの種類。**型（{@link CharacterEditCommand}）も判定
 * （{@link isCharacterEditCommand}）もこの1つの並びから導く** — 二重に列挙すると、足した種類が
 * 型には入って判定には入らない（＝駆動へ流れてしまう）ずれが黙って起きる。
 */
const CHARACTER_EDIT_COMMAND_TYPES = [
  "set-portrait",
  "clear-portrait",
  "set-outfit-accent",
  "set-accent",
  "clear-chat-accent",
  "set-profile",
  "set-background",
  "clear-background",
  "set-face",
  "clear-face",
] as const

/**
 * キャラクターパックの見た目（立ち絵・差し色・背景）とプロフィール（名前・ひとこと）を変える
 * コマンド。**書き込む先は `pack` で指す**（使用中のパックに限らない）。**どれも駆動には
 * 渡らない**（書き込みと `character-changed` の流し直しで済むので、使用中のパックを変えたときも
 * セッションは起こし直さない。`docs/design.md` 7.1）。
 */
export type CharacterEditCommand = Extract<
  ClientCommand,
  { readonly type: (typeof CHARACTER_EDIT_COMMAND_TYPES)[number] }
>

/**
 * 新しいキャラクターパックを作るコマンド。**これも駆動には渡らない**（書いたあと、選択肢の
 * 増えた `character-changed` を流し直すだけ。**作った直後に切り替えはしない** —
 * 切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない。
 * `docs/design.md` 7.1）。
 */
export type CharacterCreateCommand = Extract<ClientCommand, { readonly type: "create-character" }>

/**
 * キャラクターパックを消すコマンド。**これも駆動には渡らない**（消したあと、選択肢の減った
 * `character-changed` を流し直すだけ。使用中のパックは消せないので、セッションは起こし直さない）。
 */
export type CharacterDeleteCommand = Extract<ClientCommand, { readonly type: "delete-character" }>

/**
 * 提案を1件見送るコマンド。**これも駆動には渡らない**（書いたあと、`usage-proposal-dismissed`を
 * 流し直すだけ。`forget-remembered-line` と同じ立場で、セッションは起こし直さない）。
 */
export type DismissUsageProposalCommand = Extract<
  ClientCommand,
  { readonly type: "dismiss-usage-proposal" }
>

/**
 * 駆動へそのまま渡すコマンド（起こし直しと見た目の編集はサーバ側で捌くので外れる。
 * `nudge` も文面をサーバ側が足すので外れる）。**`forget-remembered-line` も外れる** —
 * 書き込みと `remembered-lines-changed` の流し直しで済み、`editCharacter` と同じくセッションは
 * 起こし直さない（`docs/design.md` 7.1）。**`open-file` も外れる** — git 管理下の一覧との
 * 照合と `orca file open` の呼び出しだけで、駆動には触らない。**`reflect-achievement` も外れる** —
 * `nudge` と同じく文面（依頼文）をサーバ側が組んでから駆動へ送る（`docs/design.md`「日記の受け取りと
 * 保存」「コマンドと依頼」）。**`set-visit-enabled` も外れる** — `session-manager.ts` が
 * `visit-enabled-changed` を組み立てて流すだけで、駆動には触らない。
 */
export type DriverCommand = Exclude<
  ClientCommand,
  | CharacterEditCommand
  | CharacterCreateCommand
  | CharacterDeleteCommand
  | { readonly type: "switch-character" }
  | { readonly type: "switch-session" }
  | { readonly type: "set-chat-mode" }
  | { readonly type: "nudge" }
  | { readonly type: "set-session-default" }
  | { readonly type: "set-visit-enabled" }
  | { readonly type: "forget-remembered-line" }
  | { readonly type: "dismiss-usage-proposal" }
  | { readonly type: "open-file" }
  | { readonly type: "reflect-achievement" }
>

/** 見た目の編集のコマンドかどうか（`src/server/session/core/session-manager.ts` の分岐で使う）。 */
export function isCharacterEditCommand(command: ClientCommand): command is CharacterEditCommand {
  return CHARACTER_EDIT_COMMAND_TYPES.some((type) => type === command.type)
}

/**
 * 届いた値をコマンドとして検証する。形が合わないときは undefined を返す
 * （**理由に届いた値を含めない**。呼び出し側は定型文の `error` フレームを返す）。
 */
export function parseClientCommand(value: unknown): ClientCommand | undefined {
  const parsed = clientCommandSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
