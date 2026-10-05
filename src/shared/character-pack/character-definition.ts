// キャラクター定義ファイル（character.json）そのものの形。
// 読み取り（解析）と、画面から変えられる1件を重ねた書き戻しの文字列を持つ。
// 扱うのは文字列までで、ファイルを読み書きするのは呼び出し側。
//
// character.json は利用者が用意する外部由来のファイルなので構造を信用しない。
// unknown で受けて検証し、壊れている・キーが無いときは undefined に落とす。

import { fromKeys, isPlainObject } from "remeda"

import { optionalString } from "../utils/optional-string.ts"
import { type CharacterBackground, toCharacterBackground } from "./character-background.ts"
import { isDiaryFontFileName } from "./character-diary-font.ts"
import { type CharacterVisit, toCharacterVisit } from "./character-visit.ts"
import {
  EXPRESSIONS,
  type Expression,
  OUTFITS,
  type Outfit,
  type RemovableExpression,
} from "./expression.ts"

/**
 * character.json の中身。`portraits` / `outfitAccents` は「あるものだけでよい」。
 * 無い表情・衣装はキーごと消すのではなく値を undefined にして持つ。
 */
export type CharacterDefinition = {
  readonly name: string | undefined
  /**
   * 表情名 → 日本語ラベル（`speak` の説明と立ち絵の alt に出る）。
   * 定義に無い表情は `expressionChoices` が表情名そのものをラベルにする。
   */
  readonly expressions: Readonly<Record<Expression, string | undefined>>
  /**
   * キャラクターの色。衣装ごとの差し色（`outfitAccents`）とは別物で、立ち絵の中だけでなく画面全体（吹き出し・選ばれたタブ・フォーカスの輪など）に効く。
   * 無ければ画面側の既定値に落ちる。
   */
  readonly accent: string | undefined
  /**
   * 雑談中だけ効くキャラクターの色。`accent` と同じ枠を、モードに応じて差し替えるだけ。
   * 任意で、無いパックは雑談中も `accent` のまま。
   */
  readonly chatAccent: string | undefined
  readonly portraits: Readonly<Record<Expression, string | undefined>>
  /**
   * ミニ立ち絵の素材のファイル名（レポートの筆先に添う1体）。
   * 任意で、無いパックは `portraits.default` の縮小に落ちる。
   * 表情では変わらないので `portraits` とは別の1件で持つ。
   */
  readonly mini: string | undefined
  /**
   * 帯の左端に出す顔の素材のファイル名。表情では変わらない1枚で、正方形を勧める。
   * 任意で、無ければ帯には何も出さない（`mini` や `portraits` からのフォールバックはしない）。
   */
  readonly face: string | undefined
  /**
   * ひとことプロフィール。雑談中のサイドバーのプロフィールの札で、名前の下に1行添える。
   * 任意で、無いパックは名前だけになる。空白だけの値は無いのと同じに畳む（札に空の行が出ないように）。
   */
  readonly tagline: string | undefined
  /**
   * キャラクターが利用者を呼ぶ言葉。セリフのログで依頼の区切りの頭に付く。
   * 任意で、無いパックは呼び名を付けない。空白だけの値は無いのと同じに畳む。
   */
  readonly userCall: string | undefined
  /**
   * ミニ立ち絵をキャラクターの世界で何と呼ぶか。ミニ立ち絵の alt に出る。
   * 任意で、無いパックは画面側の中立な呼び名に落ちる。空白だけの値は無いのと同じに畳む。
   */
  readonly miniCall: string | undefined
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
  /**
   * キャラビューに敷く背景。素材のファイル名と覆いの不透明度の組で、無ければ背景そのものが出ない（既定の絵には落ちない）。
   * 読めない値は {@link toCharacterBackground} が undefined か帯の中の値に畳む。
   */
  readonly background: CharacterBackground | undefined
  /**
   * 客として訪ねてくるときにパックが持つもの。型と検証は {@link toCharacterVisit} が持つ。
   * 任意で、持たないパックは客にならない。
   */
  readonly visit: CharacterVisit | undefined
  /**
   * 日記の本文に効かせる書体のファイル名。任意で、無いパックは `--font-serif`（端末の明朝体）のまま。
   * パックに同梱した書体ファイル（`woff2` / `woff` / `ttf` / `otf`）だけを指せる。
   * 読めない・パックの外を指す値は {@link isDiaryFontFileName} が undefined に畳む。
   * 効くのは成果の画面の日記の吹き出しと日記帳の見開きの本文だけ（レポートやセリフの吹き出しの書体は変えない）。
   */
  readonly diaryFont: string | undefined
}

/**
 * character.json の内容をパースする。
 * JSON として不正、またはトップレベルがオブジェクトでないときは undefined を返す（定義ファイルが無いのと同じ「立ち絵なし」扱いにするため）。
 */
export function parseCharacterDefinition(content: string): CharacterDefinition | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  return toCharacterDefinition(parsed)
}

/**
 * 生の `character.json` の文字列に、立ち絵1件の差し替えを重ねた JSON を返す。
 * `portraits` の当該の表情だけを差し替え、ほかのキー（`name` / `license` / `persona` の指定など）はそのまま残す。
 * 定義を組み直して書き戻すと、利用者が手で書いた値が消えてしまう。
 *
 * 読めない・オブジェクトでない内容は空の定義として作り直す（定義がまだ無いパックに立ち絵を足せるようにするため）。
 */
export function definitionWithPortrait(
  content: string | undefined,
  expression: Expression,
  fileName: string,
): string {
  return editedDefinitionJson(content, "portraits", expression, fileName)
}

/** 立ち絵1件を消した JSON を返す。受け取れるのは必須でない表情だけ（`default` は {@link RemovableExpression} の型で入らない）。 */
export function definitionWithoutPortrait(
  content: string | undefined,
  expression: RemovableExpression,
): string {
  return editedDefinitionJson(content, "portraits", expression, undefined)
}

/** 差し色1件を差し替えた JSON を返す。ほかのキーはそのまま残す。 */
export function definitionWithOutfitAccent(
  content: string | undefined,
  outfit: Outfit,
  color: string,
): string {
  return editedDefinitionJson(content, "outfitAccents", outfit, color)
}

/** 画面の差し色のうちどちらを差すか。`work` は仕事中（`accent`）、`chat` は雑談中だけ（`chatAccent`）に対応する。 */
export const ACCENT_TARGETS = ["work", "chat"] as const

export type AccentTarget = (typeof ACCENT_TARGETS)[number]

/** 外から届いた文字列が {@link ACCENT_TARGETS} のいずれかかどうかを検証する。 */
export function isAccentTarget(value: string): value is AccentTarget {
  return ACCENT_TARGETS.some((target) => target === value)
}

/** 画面の差し色（`accent` / `chatAccent`）1件を差し替えた JSON を返す。ほかのキーはそのまま残す。 */
export function definitionWithAccent(
  content: string | undefined,
  target: AccentTarget,
  color: string,
): string {
  return editedTopLevelDefinitionJson(content, target === "work" ? "accent" : "chatAccent", color)
}

/**
 * `chatAccent` を消した JSON を返す（画面の「仕事と同じにする」）。
 * `accent` を消す口は無い（`accent` が無いと吹き出しなど画面全体の色が既定値へ落ちてしまうため）。
 */
export function definitionWithoutChatAccent(content: string | undefined): string {
  return editedTopLevelDefinitionJson(content, "chatAccent", undefined)
}

/**
 * 表示名として受け付ける長さの上限。作るときと `characterPack.setProfile` で変えるときの両方の境界がこれを見る。
 * 文字種は縛らない（表示名は日本語も使える。長さだけがネットワーク越しに届く値としての素朴な歯止め）。
 */
export const MAX_CHARACTER_NAME_LENGTH = 100

/** ひとことプロフィールとして受け付ける長さの上限。「1行」の性質は覚えたこと1行の上限（`MAX_REMEMBERED_LINE_LENGTH`）と同じ値に揃える。 */
export const MAX_CHARACTER_TAGLINE_LENGTH = 120

/**
 * 表示名（`character.json` の `name`）を差し替えた JSON を返す。
 * 空文字（前後の空白だけも含む）は書かない。
 * 名前が無い定義は読む側がパックの id へ落とすので、ここでわざわざ id を書き込まない。
 */
export function definitionWithName(content: string | undefined, name: string): string {
  return editedTopLevelDefinitionJson(content, "name", name.trim() === "" ? undefined : name)
}

/**
 * ひとことプロフィール（`tagline`）を差し替えた JSON を返す。
 * 空文字は消すのと同じ（{@link toCharacterDefinition} の読み取りが空白だけの値を無いものへ畳むのに揃える）。
 */
export function definitionWithTagline(content: string | undefined, tagline: string): string {
  return editedTopLevelDefinitionJson(
    content,
    "tagline",
    tagline.trim() === "" ? undefined : tagline,
  )
}

/** 帯の左端・一覧の丸・名乗りの大きな丸に出す顔（`character.json` の `face`）を差し替えた JSON を返す。 */
export function definitionWithFace(content: string | undefined, fileName: string): string {
  return editedTopLevelDefinitionJson(content, "face", fileName)
}

/** 顔を消した JSON を返す（消すと帯・一覧・名乗りの丸には何も出なくなる。点線の丸に戻る）。 */
export function definitionWithoutFace(content: string | undefined): string {
  return editedTopLevelDefinitionJson(content, "face", undefined)
}

/**
 * 背景の素材を差し替えた JSON を返す。
 * 覆いの不透明度（`veil`）はそのまま残す（画面から変えられるのは素材だけで、濃さは定義ファイルを手で直す）。
 */
export function definitionWithBackground(content: string | undefined, fileName: string): string {
  return editedDefinitionJson(content, "background", "image", fileName)
}

/**
 * 背景を消した JSON を返す。
 * 消すのは素材の指定だけで、`veil` は残る（もう一度差したときにその人が書いた濃さが戻る。素材が無ければ背景は出ない）。
 */
export function definitionWithoutBackground(content: string | undefined): string {
  return editedDefinitionJson(content, "background", "image", undefined)
}

function toCharacterDefinition(value: unknown): CharacterDefinition | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    accent: typeof value.accent === "string" ? value.accent : undefined,
    chatAccent: typeof value.chatAccent === "string" ? value.chatAccent : undefined,
    expressions: toExpressionLabels(value.expressions),
    portraits: toPortraits(value.portraits),
    mini: typeof value.mini === "string" ? value.mini : undefined,
    face: typeof value.face === "string" ? value.face : undefined,
    tagline: nonBlankString(value.tagline),
    userCall: nonBlankString(value.userCall),
    miniCall: nonBlankString(value.miniCall),
    outfitAccents: toOutfitAccents(value.outfitAccents),
    background: toCharacterBackground(value.background),
    visit: toCharacterVisit(value.visit),
    diaryFont: toDiaryFont(value.diaryFont),
  }
}

/** `diaryFont` を読む。文字列でない・パックの外を指す形は undefined（既定の明朝体に落ちる）。 */
function toDiaryFont(value: unknown): string | undefined {
  return typeof value === "string" && isDiaryFontFileName(value) ? value : undefined
}

function toExpressionLabels(source: unknown): Readonly<Record<Expression, string | undefined>> {
  const record = isPlainObject(source) ? source : {}
  return fromKeys(EXPRESSIONS, (expression) => stringField(record, expression))
}

function toPortraits(source: unknown): Readonly<Record<Expression, string | undefined>> {
  const record = isPlainObject(source) ? source : {}
  return fromKeys(EXPRESSIONS, (expression) => stringField(record, expression))
}

function toOutfitAccents(source: unknown): Readonly<Record<Outfit, string | undefined>> {
  const record = isPlainObject(source) ? source : {}
  return fromKeys(OUTFITS, (outfit) => stringField(record, outfit))
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  return optionalString(record[key])
}

/**
 * 定義の入れ子のキー1つを差し替えた JSON 文字列を作る。
 * 値が undefined のキーは `JSON.stringify` が落とすので、それが「消す」になる。
 * 整形は2スペース（利用者があとから手で編集する前提のファイルなので、1行に潰さない）。
 */
function editedDefinitionJson(
  content: string | undefined,
  group: "portraits" | "outfitAccents" | "background",
  key: string,
  value: string | undefined,
): string {
  const source = parsedDefinitionRecord(content)
  const edited = { ...asRecord(source[group]), [key]: value }
  return `${JSON.stringify({ ...source, [group]: edited }, undefined, 2)}\n`
}

/** 最上位のキー1つ（`accent` / `chatAccent` / `name` / `tagline`）を差し替えた JSON 文字列を作る。 */
function editedTopLevelDefinitionJson(
  content: string | undefined,
  key: "accent" | "chatAccent" | "name" | "tagline" | "face",
  value: string | undefined,
): string {
  const source = parsedDefinitionRecord(content)
  return `${JSON.stringify({ ...source, [key]: value }, undefined, 2)}\n`
}

function parsedDefinitionRecord(content: string | undefined): Readonly<Record<string, unknown>> {
  return asRecord(content === undefined ? undefined : parseJson(content))
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isPlainObject(value) ? value : {}
}
