// いま出しているキャラクターの姿（`CharacterInfo`）と、切り替えの選択肢・パックの名前。
// **画面（キャラビュー・サイドバーの `<select>`・キャラクター画面）が読む形**で、定義ファイルの
// 生の形（`character-definition.ts`）から `toCharacterInfo` が1回だけ変換する。
//
// **立ち絵の中身は持たない**（`portraits` の値は `/character/<file>` の URL。組み立ては
// `character-asset.ts`）。ファイルI/Oは src/server/adapter/character-pack.ts に集約する。

import { characterAssetCacheKey, characterAssetPath } from "./character-asset.ts"
import { type CharacterBackground } from "./character-background.ts"
import { type CharacterDefinition } from "./character-definition.ts"
import { type ExpressionChoice, expressionChoices } from "./expression-choice.ts"
import { type Expression, type Outfit } from "./expression.ts"

/**
 * キャラビューに渡す、キャラクター定義の姿（`character-changed` イベント・`SessionState.character`
 * の中身。docs/design.md 4.1 / 4.2）。**`portraits` の値は `/character/<file>` の URL**
 * （ファイル名ではない。素材の中身はここにもイベントにも乗せない）。
 */
export type CharacterInfo = {
  /**
   * いま出しているキャラクターパックの名前（`characters/<pack>` のディレクトリ名）。
   * **`switch-character` の鍵**で、サイドバーの `<select>` の選択値でもある。パックの
   * ディレクトリが分からないとき（既定の場所を直に指したときなど）は undefined。
   */
  readonly pack: string | undefined
  readonly name: string | undefined
  /** {@link CharacterDefinition.accent} をそのまま持つ。ブラウザ側は `--accent` に流す。 */
  readonly accent: string | undefined
  readonly expressions: readonly ExpressionChoice[]
  readonly portraits: Readonly<Record<Expression, string | undefined>>
  /**
   * ミニ立ち絵の URL（`/character/<file>`。レポートの筆先に添う1体。
   * docs/requirements.md 4.3）。**定義に `mini` が無ければ `portraits.default` に落として
   * 持つ**ので、読む側は「あるかどうか」だけを見れば足りる（縮小するのは画面側）。
   * `default` も無いパックでは undefined（ミニ立ち絵そのものが出ない）。
   */
  readonly mini: string | undefined
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
  /**
   * キャラビューに敷く背景（`docs/design.md` 13.8）。**`image` は `/character/<file>` の URL**
   * （立ち絵と同じ経路・同じ取り直しの印）。無ければ背景は出ない（`ground` の上に立ち絵が
   * 直接立つ、いままでの見え方）。**効くのはキャラビューだけ。**
   */
  readonly background: CharacterBackground | undefined
  /**
   * 立ち絵と差し色を**画面から変えられるか**。変えた結果の書き込み先は
   * `~/.tsukumo/characters/<name>/` の1箇所だけで（`docs/design.md` 7.1）、そこに書いた版が
   * 探索の順で**起動先の `characters/local` に負けるパックだけが false** になる
   * （書いても次の起動で読まれないので、画面から口を出さない）。
   */
  readonly editable: boolean
}

/**
 * 切り替えの選択肢1つ分（サイドバーの `<select>`）。`name` は `characters/<name>` の
 * ディレクトリ名で、`label` は画面に出す名前（`character.json` の `name`。無ければ `name`）。
 */
export type CharacterPackChoice = {
  readonly name: string
  readonly label: string
}

/**
 * キャラクターパックの名前（`characters/<name>` のディレクトリ名）として受け付ける長さの上限。
 * **切り替えのときは長さしか見ない**（名前をパスとして組み立てず、一覧にある名前とだけ
 * 突き合わせるので、`..` のような値は自然に「見つからない」に落ちる）。
 */
export const MAX_CHARACTER_PACK_NAME_LENGTH = 200

/**
 * **新しく作る**パックの名前として受け付ける形か（`docs/design.md` 7.1）。作るときだけは
 * 受け取った文字列がディレクトリ名になるので、切り替えより厳しく見る:
 *
 * - 使えるのは半角英数字と `.` `_` `-` だけ（パスの区切り・空白・非 ASCII は入らない）
 * - `.` で始まらない（`.` `..` と隠しディレクトリが名前として通らないので、パストラバーサルの
 *   経路が生まれない）
 *
 * 表示名（`character.json` の `name`）はこの制限とは別で、パックを作ったあと定義ファイルを
 * 手で直せば日本語も使える。
 */
export function isCharacterPackName(value: string): boolean {
  return value.length <= MAX_CHARACTER_PACK_NAME_LENGTH && CHARACTER_PACK_NAME_PATTERN.test(value)
}

const CHARACTER_PACK_NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

/** {@link toCharacterInfo} に渡すもの。パックそのもの（`adapter` の型）はここでは知らない。 */
export type CharacterInfoSource = {
  readonly definition: CharacterDefinition | undefined
  /** `characters/<name>` のディレクトリ名（既定の場所を直に指したときは undefined）。 */
  readonly pack: string | undefined
  /** 素材の版（`/character/<file>` に付ける取り直しの印。無ければ名前だけで組む）。 */
  readonly revision: string | undefined
  readonly editable: boolean
}

/**
 * キャラクター定義を {@link CharacterInfo}（キャラビューに渡す形）にする。ファイル名を
 * {@link characterAssetPath} で URL に変える。定義が無い・壊れているときも、欠けた形
 * （立ち絵なし・`default` だけの表情）で返す。
 */
export function toCharacterInfo(source: CharacterInfoSource): CharacterInfo {
  const definition = source.definition
  const cacheKey = characterAssetCacheKey(source.pack, source.revision)
  const portraits = portraitUrls(definition, cacheKey)
  return {
    pack: source.pack,
    name: definition?.name,
    accent: definition?.accent,
    expressions: expressionChoices(definition),
    portraits,
    mini: portraitUrl(definition?.mini, cacheKey) ?? portraits.default,
    outfitAccents: definition?.outfitAccents ?? EMPTY_OUTFIT_ACCENTS,
    background: backgroundWithUrl(definition?.background, cacheKey),
    editable: source.editable,
  }
}

/** 背景の素材のファイル名を `/character/<file>` の URL に変える（覆いの濃さはそのまま）。 */
function backgroundWithUrl(
  background: CharacterBackground | undefined,
  cacheKey: string | undefined,
): CharacterBackground | undefined {
  return background === undefined
    ? undefined
    : { image: characterAssetPath(background.image, cacheKey), veil: background.veil }
}

function portraitUrls(
  definition: CharacterDefinition | undefined,
  cacheKey: string | undefined,
): Readonly<Record<Expression, string | undefined>> {
  if (definition === undefined) {
    return EMPTY_PORTRAITS
  }
  return {
    default: portraitUrl(definition.portraits.default, cacheKey),
    thinking: portraitUrl(definition.portraits.thinking, cacheKey),
    proud: portraitUrl(definition.portraits.proud, cacheKey),
    flustered: portraitUrl(definition.portraits.flustered, cacheKey),
    serious: portraitUrl(definition.portraits.serious, cacheKey),
    curious: portraitUrl(definition.portraits.curious, cacheKey),
    sad: portraitUrl(definition.portraits.sad, cacheKey),
    excited: portraitUrl(definition.portraits.excited, cacheKey),
  }
}

function portraitUrl(
  fileName: string | undefined,
  cacheKey: string | undefined,
): string | undefined {
  return fileName === undefined ? undefined : characterAssetPath(fileName, cacheKey)
}

const EMPTY_PORTRAITS: Readonly<Record<Expression, string | undefined>> = {
  default: undefined,
  thinking: undefined,
  proud: undefined,
  flustered: undefined,
  serious: undefined,
  curious: undefined,
  sad: undefined,
  excited: undefined,
}

const EMPTY_OUTFIT_ACCENTS: Readonly<Record<Outfit, string | undefined>> = {
  default: undefined,
  light: undefined,
  normal: undefined,
  heavy: undefined,
}

/**
 * 表情に対応する立ち絵の URL を決める。該当する表情の指定が無ければ `default` に落ちる
 * （docs/requirements.md 4.4「あるものだけでよい」）。`default` も無ければ undefined を返し、
 * 呼び出し側（`src/browser/components/portrait.tsx`）は立ち絵なし（吹き出しだけ）に
 * フォールバックする。
 */
export function resolvePortraitUrl(
  portraits: Readonly<Record<Expression, string | undefined>>,
  expression: Expression,
): string | undefined {
  return portraits[expression] ?? portraits.default
}

/** 衣装に対応する差し色を決める。該当する衣装の指定が無ければ `default` に落ちる。 */
export function resolveOutfitAccent(
  outfitAccents: Readonly<Record<Outfit, string | undefined>>,
  outfit: Outfit,
): string | undefined {
  return outfitAccents[outfit] ?? outfitAccents.default
}
