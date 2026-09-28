// キャラクターパックのコマンドの契約。見た目の編集10種と、作る・消すの2種。
// どれも駆動には渡らない（書き込みと `character-changed` の流し直しで済むので、使用中のパックを変えたときもセッションは起こし直さない）。

import { z } from "zod"

import {
  MAX_BACKGROUND_DATA_URL_LENGTH,
  parseBackgroundImage,
} from "../character-pack/character-background.ts"
import {
  type AccentTarget,
  isAccentTarget,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../character-pack/character-definition.ts"
import { MAX_FACE_DATA_URL_LENGTH, parseFaceImage } from "../character-pack/character-face.ts"
import { isCharacterPackName } from "../character-pack/character.ts"
import {
  type Expression,
  isExpression,
  isOutfit,
  isRemovableExpression,
  type Outfit,
  type RemovableExpression,
} from "../character-pack/expression.ts"
import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  parsePortraitImage,
} from "../character-pack/portrait-image.ts"
import { commandBase } from "../command.ts"

/**
 * 立ち絵1枚の data URL。大きさと種類はここで見る。
 *
 * 文字列のまま持ち、`{ format, base64 }` へのほどきは書き込む側が同じ {@link parsePortraitImage} で行う。
 * zod の `transform` で形を変えないのは、ブラウザ側が送るときの型が受け取ったあとの形にすり替わってしまうため。
 */
const portraitDataUrlSchema = z
  .string()
  .max(MAX_PORTRAIT_DATA_URL_LENGTH)
  .refine((value) => parsePortraitImage(value) !== undefined)

/**
 * 背景1枚の data URL。受け取るのは `.png` / `.jpg` / `.webp` の3つだけ（`.gif` は入れない。動く背景は読む面の隣で気が散る）。
 * 立ち絵と同じく文字列のまま持ち、ほどくのは書き込む側。
 */
const backgroundDataUrlSchema = z
  .string()
  .max(MAX_BACKGROUND_DATA_URL_LENGTH)
  .refine((value) => parseBackgroundImage(value) !== undefined)

/** 帯の左端・一覧の丸・名乗りの大きな丸に出す顔1枚の data URL。受け取るのは立ち絵と同じ `.svg` / `.png` / `.gif` の3つだけ。 */
const faceDataUrlSchema = z
  .string()
  .max(MAX_FACE_DATA_URL_LENGTH)
  .refine((value) => parseFaceImage(value) !== undefined)

/** 差し色（`<input type="color">` が渡す形）。16進の値そのものはここに書かない。 */
const accentColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)

/**
 * 新しく作るパックの名前。
 * 受け取った文字列がディレクトリ名になるので、切り替え（`session.switchCharacter`）の「長さだけ」より厳しく {@link isCharacterPackName} で見る。
 */
const newCharacterPackNameSchema = z.string().refine(isCharacterPackName)

/**
 * 見た目の編集で書き込む先のパックの名前。使用中を暗黙にしないので、編集のコマンドはどれもこれを必須で持つ。
 * 書き込み先 `~/.tsukumo/characters/<name>/` のディレクトリ名になる値なので、作るときと同じ {@link isCharacterPackName} で見る。
 * 一覧にある名前かどうかは書き込む側が突き合わせる。
 */
const editedCharacterPackNameSchema = z.string().refine(isCharacterPackName)

/**
 * 表示名（`character.json` の `name`）。
 * 空文字も通し（空なら読む側が id へ落とす）、長さの素朴な上限だけを見る。文字種は縛らない（日本語も使える）。
 */
const characterNameSchema = z.string().max(MAX_CHARACTER_NAME_LENGTH)

/** ひとことプロフィール（`character.json` の `tagline`）。空文字も通す（空なら消したのと同じに畳む）。 */
const characterTaglineSchema = z.string().max(MAX_CHARACTER_TAGLINE_LENGTH)

const expressionSchema = z.custom<Expression>(
  (value) => typeof value === "string" && isExpression(value),
)

/** 立ち絵を消せる表情。必須の `default` はここで弾かれる。 */
const removableExpressionSchema = z.custom<RemovableExpression>(
  (value) => typeof value === "string" && isRemovableExpression(value),
)

const outfitSchema = z.custom<Outfit>((value) => typeof value === "string" && isOutfit(value))

/** 画面の差し色（`accent` / `chatAccent`）のうちどちらを差すか。 */
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
  /** 画面の差し色（`accent` / `chatAccent`）を差す。どちらを差すかは `target` で分ける。 */
  setAccent: z.object({
    pack: editedCharacterPackNameSchema,
    target: accentTargetSchema,
    color: accentColorSchema,
  }),
  /** 雑談の差し色（`chatAccent`）を消し、雑談中も仕事の差し色（`accent`）と同じに戻す。`accent` を消す口は無い。 */
  clearChatAccent: z.object({ pack: editedCharacterPackNameSchema }),
  /**
   * 名前とひとことプロフィールを変える。1つの画面のボタンから2つの欄をまとめて送るので、コマンドも1つにする。
   * どちらも空文字を通す（名前は id へ、ひとことは「無い」へ畳む）。
   */
  setProfile: z.object({
    pack: editedCharacterPackNameSchema,
    name: characterNameSchema,
    tagline: characterTaglineSchema,
  }),
  /**
   * キャラビューに敷く背景を差し替える／消す。
   * 覆いの濃さは画面から変えないので、受け取るのは素材だけ（濃さは定義ファイルを手で直す）。
   */
  setBackground: z.object({ pack: editedCharacterPackNameSchema, image: backgroundDataUrlSchema }),
  clearBackground: z.object({ pack: editedCharacterPackNameSchema }),
  /** 帯の左端・一覧の丸・名乗りの大きな丸に出す顔を差し替える／外す。 */
  setFace: z.object({ pack: editedCharacterPackNameSchema, image: faceDataUrlSchema }),
  clearFace: z.object({ pack: editedCharacterPackNameSchema }),
}

type CharacterEditInput = typeof characterEditInput

/**
 * 見た目（立ち絵・差し色・背景・顔）とプロフィール（名前・ひとこと）の編集1件。
 * どれを変えるかは `kind`（手続きの名前）で分ける（書き込む側が1つの関数で受けるため）。
 */
export type CharacterEdit = {
  readonly [K in keyof CharacterEditInput]: { readonly kind: K } & z.infer<CharacterEditInput[K]>
}[keyof CharacterEditInput]

/**
 * 新しいキャラクターパックを作る入力。
 * 作った直後に切り替えはしない（切り替えは駆動の起こし直しで画面が初期化されるので、作る操作の副作用にしない）。
 */
const characterCreateInput = z.object({
  // 保存するフォルダの名前。作ったあとは変えない。
  id: newCharacterPackNameSchema,
  // 画面や吹き出しに出る名前。空なら id をそのまま使う。
  name: characterNameSchema,
  // 必須の1つ（`REQUIRED_EXPRESSIONS`）をここで required にするので、立ち絵が無いパックは書き込む側まで届かない。
  portraits: z.object({ default: portraitDataUrlSchema }),
  // 画面の差し色（仕事・雑談の2つ）。どちらも必須（作ったあとに片方だけ消したくなったら `clearChatAccent` で外せる）。
  accent: accentColorSchema,
  chatAccent: accentColorSchema,
})

export type CharacterCreate = z.infer<typeof characterCreateInput>

/**
 * キャラクターパックを消す入力。
 * 消すのはホームの版だけで、同梱のパックを画面で直したものなら同梱の版が一覧に戻る。
 * 形は見た目の編集と同じ {@link isCharacterPackName} で見る。
 * id を打って確かめるのは画面の側で、サーバは名前を受けて消すだけ（使用中・ホームに無いパックは断る）。
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
