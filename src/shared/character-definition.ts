// キャラクター定義ファイル（character.json）そのものの形。**読み取り（解析）と、画面から
// 変えられる1件を重ねた書き戻しの文字列**を持つ。
//
// character.json は利用者が用意する外部由来のファイル（`characters/local/` に置く想定を含む）
// なので構造を信用しない。unknown で受けて検証し、壊れている・キーが無いときは undefined に落とす
// （docs/coding-standards.md「型を迂回するキャストを使わない」）。
//
// ファイルI/O（character.json 自体・立ち絵の画像ファイルを読み書きすること）は
// src/server/adapter/character-pack.ts と src/server/adapter/character-edit.ts に集約する。
// ここが扱うのは文字列までで、実際に読み書きするのは呼び出し側。

import { fromKeys, isPlainObject } from "remeda"

import { type CharacterBackground, toCharacterBackground } from "./character-background.ts"
import {
  EXPRESSIONS,
  type Expression,
  OUTFITS,
  type Outfit,
  type RemovableExpression,
} from "./expression.ts"
import { optionalString } from "./utils/optional-string.ts"

/**
 * character.json の中身。`portraits` / `outfitAccents` は「あるものだけでよい」
 * （docs/requirements.md 4.4）。無い表情・衣装はキーごと消すのではなく値を undefined にして持つ
 * （`?:` は使わない。docs/coding-standards.md「「無いかもしれない」値」）。
 */
export type CharacterDefinition = {
  readonly name: string | undefined
  /**
   * 表情名 → 日本語ラベル。**表情の呼び名はキャラクターごとの言葉**なのでコードに持たない
   * （docs/design.md 7章。`speak` の説明と立ち絵の alt に出る）。定義に無い表情は
   * `expressionChoices`（`shared/expression-choice.ts`）が表情名そのものをラベルにする。
   */
  readonly expressions: Readonly<Record<Expression, string | undefined>>
  /**
   * キャラクターの色（`docs/screen-design.md` 13.2 の `accent`）。**衣装ごとの差し色
   * （`outfitAccents`）とは別物**で、立ち絵の中だけでなく画面全体（吹き出し・選ばれたタブ・
   * フォーカスの輪など、13.1 原則1が許す場所）に効く。無ければ画面側の既定値に落ちる。
   */
  readonly accent: string | undefined
  /**
   * 雑談中だけ効くキャラクターの色（`docs/screen-design.md` 13.2「雑談中は」/ 13.7）。**`accent` と
   * 同じ枠を、モードに応じて差し替えるだけ**（つまみは増えない）。**任意**で、無いパックは
   * 雑談中も `accent` のまま（仕事と同じ差し色）。
   */
  readonly chatAccent: string | undefined
  readonly portraits: Readonly<Record<Expression, string | undefined>>
  /**
   * ミニ立ち絵の素材のファイル名（レポートの筆先に添う1体。docs/requirements.md 4.3）。
   * **任意**で、無いパックは `portraits.default` の縮小に落ちる（4.4「あるものだけでよい」に
   * 例外を作らない）。表情では変わらないので `portraits` とは別の1件で持つ。
   */
  readonly mini: string | undefined
  /**
   * 帯の左端に出す顔の素材のファイル名（`docs/screen-design.md` 13.9「顔」）。**任意**で、無ければ
   * 帯には何も出さない（`mini` や `portraits` からのフォールバックはしない）。表情では変わらない
   * 1枚（`mini` と同じ）で、正方形を勧める。
   */
  readonly face: string | undefined
  /**
   * ひとことプロフィール（`docs/screen-design.md` 13.7「雑談のときのサイドバー」）。雑談中のサイドバーの
   * プロフィールの札で、名前の下に1行添える。**任意**で、無いパックは名前だけになる。
   * **キャラクターの言葉なのでコードに持たない**（`CLAUDE.md` 原則4）。空白だけの値は無いのと
   * 同じに畳む（札に空の行が出ないように）。
   */
  readonly tagline: string | undefined
  /**
   * キャラクターが利用者を呼ぶ言葉（`docs/glossary.md`「利用者の呼び名」）。セリフのログで依頼の
   * 区切りの頭に付く。**任意**で、無いパックは呼び名を付けない。**キャラクターの言葉なので
   * コードに持たない**（`CLAUDE.md` 原則4）。空白だけの値は無いのと同じに畳む。
   */
  readonly userCall: string | undefined
  /**
   * ミニ立ち絵をキャラクターの世界で何と呼ぶか（`docs/glossary.md`「ミニ立ち絵の呼び名」）。
   * ミニ立ち絵の alt に出る。**任意**で、無いパックは画面側の中立な呼び名に落ちる。
   * 空白だけの値は無いのと同じに畳む。
   */
  readonly miniCall: string | undefined
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
  /**
   * キャラビューに敷く背景（`docs/screen-design.md` 13.8）。**素材のファイル名と覆いの不透明度**の
   * 組で、**無ければ背景そのものが出ない**（既定の絵には落ちない）。読めない値は
   * `src/shared/character-background.ts` が undefined か帯の中の値に畳む。
   */
  readonly background: CharacterBackground | undefined
}

/**
 * character.json の内容をパースする。JSON として不正、またはトップレベルがオブジェクトで
 * ないときは undefined を返す（定義ファイルが無いのと同じ「立ち絵なし」扱いにするため）。
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
 * **`portraits` の当該の表情だけを差し替え、ほかのキー（`name` / `license` / `persona` の
 * 指定など）はそのまま残す**（画面から変えられるのは立ち絵と差し色だけなので、定義を
 * 組み直して書き戻すと利用者が手で書いた値が消えてしまう）。
 *
 * 読めない・オブジェクトでない内容は**空の定義として作り直す**（定義がまだ無いパックに
 * 立ち絵を足せるようにするため）。
 */
export function definitionWithPortrait(
  content: string | undefined,
  expression: Expression,
  fileName: string,
): string {
  return editedDefinitionJson(content, "portraits", expression, fileName)
}

/**
 * 立ち絵1件を消した JSON を返す。**受け取れるのは必須でない表情だけ**
 * （`default` は型で入らない。`src/shared/expression.ts` の {@link RemovableExpression}）。
 */
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

/**
 * 画面の差し色（`accent` / `chatAccent`）のうちどちらを差すか。`work` は仕事中（`accent`）、
 * `chat` は雑談中だけ（`chatAccent`）に対応する（`docs/screen-design.md` 13.2「雑談中は」/ 13.6）。
 */
export const ACCENT_TARGETS = ["work", "chat"] as const

export type AccentTarget = (typeof ACCENT_TARGETS)[number]

/** 外から届いた文字列が {@link ACCENT_TARGETS} のいずれかかどうかを検証する。 */
export function isAccentTarget(value: string): value is AccentTarget {
  return ACCENT_TARGETS.some((target) => target === value)
}

/**
 * 画面の差し色（`accent` / `chatAccent`）1件を差し替えた JSON を返す。ほかのキーはそのまま残す。
 * **`portraits` / `outfitAccents` と違い最上位の欄**なので、入れ子を重ねる
 * {@link editedDefinitionJson} ではなく {@link editedTopLevelDefinitionJson} を使う。
 */
export function definitionWithAccent(
  content: string | undefined,
  target: AccentTarget,
  color: string,
): string {
  return editedTopLevelDefinitionJson(content, target === "work" ? "accent" : "chatAccent", color)
}

/**
 * `chatAccent` を消した JSON を返す（画面の「仕事と同じにする」）。**`accent` を消す口は無い**
 * ——`accent` が無いと吹き出しなど画面全体の色が既定値へ落ちてしまい、`outfitAccents` の
 * 「無ければ既定へ」に相当する戻り先が無いため（`docs/screen-design.md` 13.6）。
 */
export function definitionWithoutChatAccent(content: string | undefined): string {
  return editedTopLevelDefinitionJson(content, "chatAccent", undefined)
}

/**
 * 表示名として受け付ける長さの上限（`docs/design.md` 7.1）。**作るとき・`set-profile` で
 * 変えるときの両方**が境界（`src/shared/command.ts`）でこれを見る。文字種は縛らない
 * （表示名は日本語も使える。長さだけがネットワーク越しに届く値としての素朴な歯止め）。
 */
export const MAX_CHARACTER_NAME_LENGTH = 100

/**
 * ひとことプロフィールとして受け付ける長さの上限（`docs/design.md` 7.1）。**「1行」の性質は
 * 覚えたこと1行の上限（`MAX_REMEMBERED_LINE_LENGTH`）と同じ値**を採る。
 */
export const MAX_CHARACTER_TAGLINE_LENGTH = 120

/**
 * 表示名（`character.json` の `name`）を差し替えた JSON を返す。**空文字（前後の空白だけも
 * 含む）は書かない**（`toCharacterDefinition` が空白だけの `tagline` を無いものへ畳むのと
 * 同じ考え方）。名前が無い定義は、読む側（`src/browser/features/character-screen/character-screen.tsx`
 * の `character.name ?? character.pack`・`src/server/adapter/character-pack.ts` が
 * `CharacterPackChoice.label` を組むときの `pack.definition?.name ?? pack.name`）が id へ
 * 落とすので、ここでわざわざ id を書き込まない（`docs/design.md` 7.1「新しく作るときの細部」）。
 */
export function definitionWithName(content: string | undefined, name: string): string {
  return editedTopLevelDefinitionJson(content, "name", name.trim() === "" ? undefined : name)
}

/**
 * ひとことプロフィール（`tagline`）を差し替えた JSON を返す。**空文字は消すのと同じ**
 * （`toCharacterDefinition` の読み取りが空白だけの値をもともと無いものへ畳むのに揃える）。
 */
export function definitionWithTagline(content: string | undefined, tagline: string): string {
  return editedTopLevelDefinitionJson(
    content,
    "tagline",
    tagline.trim() === "" ? undefined : tagline,
  )
}

/**
 * 帯の左端・一覧の丸・名乗りの大きな丸に出す顔（`character.json` の `face`）を差し替えた JSON を
 * 返す。**`mini` や `portraits` へのフォールバックは無い1枚**（`docs/screen-design.md` 13.9「顔」）。
 */
export function definitionWithFace(content: string | undefined, fileName: string): string {
  return editedTopLevelDefinitionJson(content, "face", fileName)
}

/** 顔を消した JSON を返す（消すと帯・一覧・名乗りの丸には何も出なくなる。点線の丸に戻る）。 */
export function definitionWithoutFace(content: string | undefined): string {
  return editedTopLevelDefinitionJson(content, "face", undefined)
}

/**
 * 背景の素材を差し替えた JSON を返す。**覆いの不透明度（`veil`）はそのまま残す** — 画面から
 * 変えられるのは素材だけで、濃さは定義ファイルを手で直す（`docs/screen-design.md` 13.6 / 13.8）。
 */
export function definitionWithBackground(content: string | undefined, fileName: string): string {
  return editedDefinitionJson(content, "background", "image", fileName)
}

/**
 * 背景を消した JSON を返す。**消すのは素材の指定だけ**で、`veil` は残る（もう一度差したときに
 * その人が書いた濃さが戻る。素材が無ければ背景は出ない）。
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
  }
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
 * 定義の入れ子のキー1つを差し替えた JSON 文字列を作る。**値が undefined のキーは
 * `JSON.stringify` が落とす**ので、それが「消す」になる。整形は2スペース（利用者が
 * あとから手で編集する前提のファイルなので、1行に潰さない）。
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

/**
 * 最上位のキー1つ（`accent` / `chatAccent` / `name` / `tagline`）を差し替えた JSON 文字列を作る。
 * 入れ子を重ねない点だけ {@link editedDefinitionJson} と違う。
 */
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
