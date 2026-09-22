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
import { type Expression, EXPRESSIONS, type Outfit } from "./expression.ts"

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
  /**
   * 表情 → 立ち絵の URL。**`default` に畳み済みの全域な表**で、読む側は表を引くだけでよい
   * （立ち絵の無い表情には `default` の絵が入っている）。`default` すら無いパックでは undefined
   * （立ち絵そのものが出ない）。
   */
  readonly portraits: Readonly<Record<Expression, string>> | undefined
  /**
   * 立ち絵を**定義に自分で持っている**表情（`EXPRESSIONS` の順）。`portraits` は畳んだあとの表で
   * 「この表情だけ無い」が読めないので、それが要るキャラクター画面（まだ入れていない枠・消す口）の
   * ためにここで持つ。`speak` の選択肢（`expressions`）とは別物。
   */
  readonly expressionsWithPortrait: readonly Expression[]
  /**
   * ミニ立ち絵の URL（`/character/<file>`。レポートの筆先に添う1体。
   * docs/requirements.md 4.3）。**定義に `mini` が無ければ `portraits.default` に落として
   * 持つ**ので、読む側は「あるかどうか」だけを見れば足りる（縮小するのは画面側）。
   * `default` も無いパックでは undefined（ミニ立ち絵そのものが出ない）。
   */
  readonly mini: string | undefined
  /**
   * 衣装 → 差し色。**衣装ごとに `default` へ畳み済み**（読む側は表を引くだけでよい）。
   * `default` も無ければその衣装は undefined。
   */
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
 * （立ち絵なし・`default` だけの表情）で返す。**「この表情・衣装だけ無い」はここで `default` に
 * 畳む**（読む側へ運ばない。docs/coding-standards.md「「無い」を層をまたいで運ばない」）。
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
    expressionsWithPortrait: EXPRESSIONS.filter(
      (expression) => definition?.portraits[expression] !== undefined,
    ),
    mini:
      definition?.mini === undefined
        ? portraits?.default
        : characterAssetPath(definition.mini, cacheKey),
    outfitAccents: foldedOutfitAccents(definition),
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

/**
 * 立ち絵の表を `default` に畳んだ全域な形にする（docs/requirements.md 4.4「あるものだけでよい」）。
 * **`default` すら無いパックでは表ごと持たない**（落とし先が無いので、他の表情の絵があっても
 * 立ち絵なし＝吹き出しだけにフォールバックする）。
 */
function portraitUrls(
  definition: CharacterDefinition | undefined,
  cacheKey: string | undefined,
): Readonly<Record<Expression, string>> | undefined {
  const files = definition?.portraits
  if (files === undefined || files.default === undefined) {
    return undefined
  }
  const fallback = files.default
  const url = (fileName: string | undefined): string =>
    characterAssetPath(fileName ?? fallback, cacheKey)
  return {
    default: url(files.default),
    thinking: url(files.thinking),
    proud: url(files.proud),
    flustered: url(files.flustered),
    serious: url(files.serious),
    curious: url(files.curious),
    sad: url(files.sad),
    excited: url(files.excited),
    bored: url(files.bored),
  } satisfies Readonly<Record<Expression, string>>
}

/**
 * 差し色の表を、衣装ごとに `default` へ畳んだ形にする。**立ち絵と違って全域にはならない** —
 * `default` の差し色を持たないパック（`outfitAccents` を書いていないパックなど）にも、
 * 画面から1つの衣装にだけ差し色を入れられるので、その衣装の値は残す。値の無い衣装は、
 * 読む側が素材の既定の色（`--outfit-accent` を渡さない）か `--accent` に落とす。
 */
function foldedOutfitAccents(
  definition: CharacterDefinition | undefined,
): Readonly<Record<Outfit, string | undefined>> {
  const accents = definition?.outfitAccents
  const fallback = accents?.default
  return {
    default: fallback,
    light: accents?.light ?? fallback,
    normal: accents?.normal ?? fallback,
    heavy: accents?.heavy ?? fallback,
  } satisfies Readonly<Record<Outfit, string | undefined>>
}
