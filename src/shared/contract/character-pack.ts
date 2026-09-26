// キャラクターパックのコマンドの契約（`docs/glossary.md`「契約」）。受け手は
// `src/server/character-pack/adapter/character-pack-procedure.ts`、委ね先の行は
// `src/server/character-pack/core/character-pack-command.ts`。見た目の編集10種と、作る・消すの2種。
//
// どれも駆動には渡らない（書き込みと `character-changed` の流し直しで済むので、使用中の
// パックを変えたときもセッションは起こし直さない。`docs/design.md` 7.1）。

import { z } from "zod"

import { MAX_BACKGROUND_DATA_URL_LENGTH, parseBackgroundImage } from "../character-background.ts"
import {
  type AccentTarget,
  isAccentTarget,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../character-definition.ts"
import { MAX_FACE_DATA_URL_LENGTH, parseFaceImage } from "../character-face.ts"
import { isCharacterPackName } from "../character.ts"
import { commandBase } from "../command.ts"
import {
  type Expression,
  isExpression,
  isOutfit,
  isRemovableExpression,
  type Outfit,
  type RemovableExpression,
} from "../expression.ts"
import { MAX_PORTRAIT_DATA_URL_LENGTH, parsePortraitImage } from "../portrait-image.ts"

/**
 * 立ち絵1枚の data URL。大きさと種類はここで見る（`src/shared/portrait-image.ts`。
 * 受け取るのは `.svg` / `.png` / `.gif` の3つだけ）。
 *
 * 文字列のまま持ち、`{ format, base64 }` へのほどきは書き込む側（`src/server/character-pack/adapter/character-edit.ts`）が
 * 同じ `parsePortraitImage` で行う。zod の `transform` で形を変えないのは、ブラウザ側が
 * 送るときの型が受け取ったあとの形にすり替わってしまうため。
 */
const portraitDataUrlSchema = z
  .string()
  .max(MAX_PORTRAIT_DATA_URL_LENGTH)
  .refine((value) => parsePortraitImage(value) !== undefined)

/**
 * 背景1枚の data URL（`docs/screen-design.md` 13.8）。受け取るのは `.png` / `.jpg` / `.webp` の
 * 3つだけ（`src/shared/character-background.ts`。`.gif` は入れない — 動く背景は読む面の隣で
 * 気が散る）。立ち絵と同じく文字列のまま持ち、ほどくのは書き込む側。
 */
const backgroundDataUrlSchema = z
  .string()
  .max(MAX_BACKGROUND_DATA_URL_LENGTH)
  .refine((value) => parseBackgroundImage(value) !== undefined)

/**
 * 帯の左端・一覧の丸・名乗りの大きな丸に出す顔1枚の data URL（`docs/screen-design.md` 13.9「顔」）。
 * 受け取るのは立ち絵と同じ `.svg` / `.png` / `.gif` の3つだけ（`src/shared/character-face.ts`。
 * 立ち絵と同じ「キャラクターの絵」という素材の性質なので、写真が主な背景〔`.png` / `.jpg` /
 * `.webp`〕ではなく立ち絵に揃える）。
 */
const faceDataUrlSchema = z
  .string()
  .max(MAX_FACE_DATA_URL_LENGTH)
  .refine((value) => parseFaceImage(value) !== undefined)

/** 差し色（`<input type="color">` が渡す形）。16進の値そのものはここに書かない。 */
const accentColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

/**
 * 新しく作るパックの名前。ここだけは受け取った文字列がディレクトリ名になるので、
 * 切り替え（`session.switchCharacter`）の「長さだけ」より厳しく見る
 * （`src/shared/character.ts` の {@link isCharacterPackName}。パスの区切りと `..` を
 * 名前として通さない）。
 */
const newCharacterPackNameSchema = z.string().refine(isCharacterPackName)

/**
 * 見た目の編集で書き込む先のパックの名前（`docs/design.md` 7.1）。使用中を暗黙にしないので
 * 編集のコマンドはどれもこれを必須で持つ。形は作るときと同じ {@link isCharacterPackName} で見る
 * （書き込み先 `~/.tsukumo/characters/<name>/` のディレクトリ名になる値なので、切り替えの
 * 「長さだけ」より厳しくする）。一覧にある名前かどうかは書き込む側が突き合わせる
 * （`src/server/character-pack/adapter/character-edit.ts` の `editCharacterPack`）。
 */
const editedCharacterPackNameSchema = z.string().refine(isCharacterPackName)

/**
 * 表示名（`character.json` の `name`）。空文字も通す — 空なら書き込む側が id へ落とす
 * （`src/shared/character-definition.ts` の `definitionWithName`。`docs/design.md` 7.1）ので、
 * ここでは長さの素朴な上限だけを見る。ディレクトリ名になる {@link newCharacterPackNameSchema} /
 * {@link editedCharacterPackNameSchema} と違って文字種は縛らない（日本語も使える）。
 */
const characterNameSchema = z.string().max(MAX_CHARACTER_NAME_LENGTH)

/**
 * ひとことプロフィール（`character.json` の `tagline`）。空文字も通す — 空なら消したのと
 * 同じに畳む（`definitionWithTagline`）。
 */
const characterTaglineSchema = z.string().max(MAX_CHARACTER_TAGLINE_LENGTH)

const expressionSchema = z.custom<Expression>(
  (value) => typeof value === "string" && isExpression(value),
)

/**
 * 立ち絵を消せる表情。`default` はここで弾かれる（必須の1つ。
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
 * 見た目の編集10種の入力。書き込む先は `pack` で指す（使用中のパックに限らない）。
 * 手続きの名前がそのまま {@link CharacterEdit} の `kind` になる。
 */
const characterEditInput = {
  setPortrait: z.object({
    pack: editedCharacterPackNameSchema,
    expression: expressionSchema,
    image: portraitDataUrlSchema,
  }),
  clearPortrait: z.object({
    pack: editedCharacterPackNameSchema,
    expression: removableExpressionSchema,
  }),
  setOutfitAccent: z.object({
    pack: editedCharacterPackNameSchema,
    outfit: outfitSchema,
    color: accentColorSchema,
  }),
  /**
   * 画面の差し色（`accent` / `chatAccent`）を差す（`docs/screen-design.md` 13.6）。`target` で
   * どちらを差すかを分ける（`setOutfitAccent` が衣装を引数で分けているのに揃える。手続きを
   * 2つに割らない）。
   */
  setAccent: z.object({
    pack: editedCharacterPackNameSchema,
    target: accentTargetSchema,
    color: accentColorSchema,
  }),
  /**
   * 雑談の差し色（`chatAccent`）を消し、雑談中も仕事の差し色（`accent`）と同じに戻す
   * （`docs/screen-design.md` 13.6「仕事と同じにする」）。`accent` を消す口は無い
   * （`src/shared/character-definition.ts` の `definitionWithoutChatAccent`）。
   */
  clearChatAccent: z.object({ pack: editedCharacterPackNameSchema }),
  /**
   * 名前とひとことプロフィールを変える（見本の「名前とプロフィールを変える」ボタン。画面側は
   * `docs/screen-design.md` 13.6）。1つの画面のボタンから2つの欄をまとめて
   * 送るので、コマンドも1つにする。どちらも空文字を通し、空なら書き込む側が畳む（名前は
   * id へ、ひとことは「無い」へ。`src/shared/character-definition.ts` の `definitionWithName` /
   * `definitionWithTagline`）。
   */
  setProfile: z.object({
    pack: editedCharacterPackNameSchema,
    name: characterNameSchema,
    tagline: characterTaglineSchema,
  }),
  /**
   * キャラビューに敷く背景を差し替える／消す（`docs/screen-design.md` 13.8）。覆いの濃さは
   * 画面から変えないので、受け取るのは素材だけ（濃さは定義ファイルを手で直す）。
   */
  setBackground: z.object({ pack: editedCharacterPackNameSchema, image: backgroundDataUrlSchema }),
  clearBackground: z.object({ pack: editedCharacterPackNameSchema }),
  /**
   * 帯の左端・一覧の丸・名乗りの大きな丸に出す顔を差し替える／外す（`docs/screen-design.md` 13.9「顔」）。
   * `setBackground` / `clearBackground` と同じ形。
   */
  setFace: z.object({ pack: editedCharacterPackNameSchema, image: faceDataUrlSchema }),
  clearFace: z.object({ pack: editedCharacterPackNameSchema }),
}

type CharacterEditInput = typeof characterEditInput

/**
 * 見た目（立ち絵・差し色・背景・顔）とプロフィール（名前・ひとこと）の編集1件。どれを変えるかは
 * `kind`（手続きの名前）で分ける——書き込む側（`character-edit.ts`）が1つの関数で受けるため。
 */
export type CharacterEdit = {
  readonly [K in keyof CharacterEditInput]: { readonly kind: K } & z.infer<CharacterEditInput[K]>
}[keyof CharacterEditInput]

/**
 * 新しいキャラクターパックを作る入力。作った直後に切り替えはしない — 切り替えは駆動の
 * 起こし直しで画面が初期化されるので、作る操作の副作用にしない（`docs/design.md` 7.1）。
 */
const characterCreateInput = z.object({
  // 保存するフォルダの名前（`docs/design.md` 7.1「新しく作るときの細部」）。作ったあとは
  // 変えない。
  id: newCharacterPackNameSchema,
  // 画面や吹き出しに出る名前。空なら id をそのまま使う（`definitionWithName`）ので、
  // ディレクトリ名になる `id` と違って文字種は縛らない（`characterNameSchema`）。
  name: characterNameSchema,
  // 必須の1つ（`REQUIRED_EXPRESSIONS`）をここで required にするので、立ち絵が無いパックは
  // 書き込む側まで届かない（`docs/design.md` 7.1・`characters/README.md`）。
  portraits: z.object({ default: portraitDataUrlSchema }),
  // 画面の差し色（仕事・雑談の2つ）。どちらも必須——見本の作るダイアログが2色とも
  // 埋まった状態で出すのに揃える（`docs/design.md` 7.1）。作ったあとに片方だけ消したくなったら
  // `clearChatAccent` で外せる。
  accent: accentColorSchema,
  chatAccent: accentColorSchema,
})

export type CharacterCreate = z.infer<typeof characterCreateInput>

/**
 * キャラクターパックを消す入力（`docs/design.md` 7.1「消すときの細部」）。消すのはホームの版だけで、
 * 同梱のパックを画面で直したものなら同梱の版が一覧に戻る。名前は一覧と突き合わせて引くだけで、
 * 形は見た目の編集と同じ {@link isCharacterPackName} で見る。id を打って確かめるのは画面の側
 * で、サーバは名前を受けて消すだけ（使用中・ホームに無いパックは断る。
 * `src/server/character-pack/adapter/character-edit.ts` の `deleteCharacterPack`）。
 */
const characterDeleteInput = z.object({ pack: editedCharacterPackNameSchema })

export type CharacterDelete = z.infer<typeof characterDeleteInput>

export const characterPackContract = {
  setPortrait: commandBase.input(characterEditInput.setPortrait),
  clearPortrait: commandBase.input(characterEditInput.clearPortrait),
  setOutfitAccent: commandBase.input(characterEditInput.setOutfitAccent),
  setAccent: commandBase.input(characterEditInput.setAccent),
  clearChatAccent: commandBase.input(characterEditInput.clearChatAccent),
  setProfile: commandBase.input(characterEditInput.setProfile),
  setBackground: commandBase.input(characterEditInput.setBackground),
  clearBackground: commandBase.input(characterEditInput.clearBackground),
  setFace: commandBase.input(characterEditInput.setFace),
  clearFace: commandBase.input(characterEditInput.clearFace),
  create: commandBase.input(characterCreateInput),
  /** ターン中も受け付ける（使用中のパックは消せないので、いまの会話には触らない）。 */
  delete: commandBase.input(characterDeleteInput),
}
