// いま出しているキャラクターの姿（`CharacterInfo`）と、パックの一覧の1件（`CharacterPackEntry`）・
// パックの名前。**画面（キャラビュー・サイドバーの `<select>`・キャラクター画面）が読む形**で、
// 定義ファイルの生の形（`character-definition.ts`）から `toCharacterInfo` が1回だけ変換する。
//
// **立ち絵の中身は持たない**（`portraits` の値は `/character/<pack>/<file>` の URL。組み立ては
// `character-asset.ts`）。ファイルI/Oは src/server/character-pack/adapter/character-pack.ts に集約する。

import { fromKeys } from "remeda"

import { characterAssetPath } from "./character-asset.ts"
import { type CharacterBackground } from "./character-background.ts"
import { type CharacterDefinition } from "./character-definition.ts"
import { type ExpressionChoice, expressionChoices } from "./expression-choice.ts"
import { type Expression, EXPRESSIONS, type Outfit, OUTFITS } from "./expression.ts"

/**
 * キャラビューに渡す、キャラクター定義の姿（`character-changed` イベント・`SessionState.character`
 * の中身。docs/design.md 4.1 / 4.2）。**`portraits` の値は `/character/<pack>/<file>` の URL**
 * （ファイル名ではない。素材の中身はここにもイベントにも乗せない）。
 */
export type CharacterInfo = {
  /**
   * いま出しているキャラクターパックの名前（`characters/<pack>` のディレクトリ名）。
   * **`switch-character` の鍵**で、サイドバーの `<select>` の選択値でもある。素材の URL の
   * `<pack>` の区間もこれ。
   */
  readonly pack: string
  readonly name: string | undefined
  /** {@link CharacterDefinition.accent} をそのまま持つ。ブラウザ側は `--accent` に流す。 */
  readonly accent: string | undefined
  /**
   * {@link CharacterDefinition.chatAccent} をそのまま持つ。雑談中だけ `--accent` に流す
   * （無ければ {@link accent} のまま。{@link effectiveAccent}）。
   */
  readonly chatAccent: string | undefined
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
   * ミニ立ち絵の URL（`/character/<pack>/<file>`。レポートの筆先に添う1体。
   * docs/requirements.md 4.3）。**定義に `mini` が無ければ `portraits.default` に落として
   * 持つ**ので、読む側は「あるかどうか」だけを見れば足りる（縮小するのは画面側）。
   * `default` も無いパックでは undefined（ミニ立ち絵そのものが出ない）。
   */
  readonly mini: string | undefined
  /**
   * 帯の左端に出す顔の URL（`/character/<pack>/<file>`。`docs/screen-design.md` 13.9「顔」）。**定義に `face`
   * が無いパックでは undefined**——`mini` と違い、`portraits.default` へのフォールバックはしない
   * （無いパックでは帯に何も出さない）。表情では変わらない1枚。
   */
  readonly face: string | undefined
  /**
   * {@link CharacterDefinition.tagline}（ひとことプロフィール）をそのまま持つ。雑談中の
   * サイドバーのプロフィールの札が名前の下に出す。無いパックでは undefined（名前だけ）。
   */
  readonly tagline: string | undefined
  /** {@link CharacterDefinition.userCall}（利用者の呼び名）をそのまま持つ。無いパックでは undefined。 */
  readonly userCall: string | undefined
  /** {@link CharacterDefinition.miniCall}（ミニ立ち絵の呼び名）をそのまま持つ。無いパックでは undefined。 */
  readonly miniCall: string | undefined
  /**
   * 衣装 → 差し色。**衣装ごとに `default` へ畳み済み**（読む側は表を引くだけでよい）。
   * `default` も無ければその衣装は undefined。
   */
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
  /**
   * キャラビューに敷く背景（`docs/screen-design.md` 13.8）。**`image` は `/character/<pack>/<file>` の URL**
   * （立ち絵と同じ経路・同じ取り直しの印）。無ければ背景は出ない（`ground` の上に立ち絵が
   * 直接立つ、いままでの見え方）。**効くのはキャラビューだけ。**
   */
  readonly background: CharacterBackground | undefined
  /**
   * 日記の本文に効かせる書体の URL（`/character/<pack>/<file>`。`docs/screen-design.md` 13.3
   * 「例外は日記の本文だけ」）。**定義に `diaryFont` が無いパックでは undefined**——`face` と同じく
   * 既定へのフォールバックは無い（無いパックは `--font-serif` のまま）。
   */
  readonly diaryFont: string | undefined
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
 * **一覧の1件（{@link CharacterPackEntry}）はこの形を含む**ので、選択肢だけを読む部品には
 * 一覧をそのまま渡せる。
 */
export type CharacterPackChoice = {
  readonly name: string
  readonly label: string
}

/**
 * パックの一覧の1件（`character-changed` の `packs` と `SessionState.characterPacks` の中身）。
 * キャラクター画面の一覧（顔・名前・表情の枚数・使用中か）と、選んだパックの詳しい設定
 * （立ち絵・差し色・背景・ひとこと）が読む。**使用中以外のパックも同じ形で全部持つ**
 * （`docs/design.md` 7.2）。
 *
 * 姿は {@link CharacterInfo} をそのまま入れ子で持つ（使用中のパックの姿を読む部品に、使用中以外の
 * パックの姿も同じ型で渡せる）。**「変えられるか」は `character.editable`** にあり、ここには
 * 重ねて持たない。
 */
export type CharacterPackEntry = CharacterPackChoice & {
  readonly character: CharacterInfo
  /** いま出しているパックか（一覧の中でちょうど1件だけ true。サーバが決める）。 */
  readonly inUse: boolean
  /**
   * 画面から消すと何が起きるか（サーバが決める。{@link CharacterPackRemoval}）。**使用中かどうかは
   * 混ぜない** — 使用中のパックも消したときに起きることは同じで、押せなくするのは画面が
   * {@link inUse} を見て行う（サーバも使用中は断る。`docs/design.md` 7.1「消すときの細部」）。
   */
  readonly removal: CharacterPackRemoval
}

/**
 * パックを画面から消したときに起きること（`docs/design.md` 7.1「消すときの細部」）。**消すのは
 * いつもホーム（`~/.tsukumo/characters/<name>/`）の版だけ**で、違いは消したあとに一覧に何が残るか:
 *
 * - `"delete"`: ホームにしか無いパック。一覧から消え、雑談の要約とアーカイブも一緒に消える
 * - `"revert-to-bundled"`: 同梱のパックを画面で直したもの。ホームの版が消えて**同梱の版が一覧に
 *   戻る**（画面で直したことと、キャラクター自身が人格に書き足した「覚えたこと」が消える。
 *   雑談の要約とアーカイブは残る）
 * - `"none"`: 画面からは消せない（同梱だけ・起動先の `characters/local`・一覧の外を指した
 *   `TSUKUMO_CHARACTER`）
 */
export type CharacterPackRemoval = "delete" | "revert-to-bundled" | "none"

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
 * 表示名（`character.json` の `name`）は**別の関数**（`create-character` / `set-profile` が
 * 受け取る `name`。`src/shared/command.ts`）が見ていて、文字種を縛らないので日本語も使える。
 */
export function isCharacterPackName(value: string): boolean {
  return value.length <= MAX_CHARACTER_PACK_NAME_LENGTH && CHARACTER_PACK_NAME_PATTERN.test(value)
}

const CHARACTER_PACK_NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

/** {@link toCharacterInfo} に渡すもの。パックそのもの（`adapter` の型）はここでは知らない。 */
export type CharacterInfoSource = {
  readonly definition: CharacterDefinition | undefined
  /** `characters/<name>` のディレクトリ名。素材の URL の `<pack>` の区間にもなる。 */
  readonly pack: string
  /** 素材の版（素材の URL に付ける取り直しの印 `?v=`。無ければ付けない）。 */
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
  const assetUrl = (fileName: string): string =>
    characterAssetPath(source.pack, fileName, source.revision)
  const portraits = portraitUrls(definition, assetUrl)
  return {
    pack: source.pack,
    name: definition?.name,
    accent: definition?.accent,
    chatAccent: definition?.chatAccent,
    expressions: expressionChoices(definition),
    portraits,
    expressionsWithPortrait: EXPRESSIONS.filter(
      (expression) => definition?.portraits[expression] !== undefined,
    ),
    mini: definition?.mini === undefined ? portraits?.default : assetUrl(definition.mini),
    face: definition?.face === undefined ? undefined : assetUrl(definition.face),
    tagline: definition?.tagline,
    userCall: definition?.userCall,
    miniCall: definition?.miniCall,
    outfitAccents: foldedOutfitAccents(definition),
    background: backgroundWithUrl(definition?.background, assetUrl),
    diaryFont: definition?.diaryFont === undefined ? undefined : assetUrl(definition.diaryFont),
    editable: source.editable,
  }
}

/**
 * 画面に流し込む `--accent` の値（`docs/screen-design.md` 13.2「雑談中は」）。**雑談中だけ**
 * {@link CharacterInfo.chatAccent} を使い、無ければ {@link CharacterInfo.accent} に落ちる
 * （雑談用の色を持たないパックは仕事と同じ差し色のまま）。**つまみは増えない** — `accent` という
 * 1つの枠が、モードに応じて別の値を取るだけ。
 */
export function effectiveAccent(
  character: CharacterInfo | undefined,
  chatMode: boolean,
): string | undefined {
  if (character === undefined) {
    return undefined
  }
  return chatMode ? (character.chatAccent ?? character.accent) : character.accent
}

/** 背景の素材のファイル名を素材の URL に変える（覆いの濃さはそのまま）。 */
function backgroundWithUrl(
  background: CharacterBackground | undefined,
  assetUrl: (fileName: string) => string,
): CharacterBackground | undefined {
  return background === undefined
    ? undefined
    : { image: assetUrl(background.image), veil: background.veil }
}

/**
 * 立ち絵の表を `default` に畳んだ全域な形にする（docs/requirements.md 4.4「あるものだけでよい」）。
 * **`default` すら無いパックでは表ごと持たない**（落とし先が無いので、他の表情の絵があっても
 * 立ち絵なし＝吹き出しだけにフォールバックする）。
 */
function portraitUrls(
  definition: CharacterDefinition | undefined,
  assetUrl: (fileName: string) => string,
): Readonly<Record<Expression, string>> | undefined {
  const files = definition?.portraits
  if (files === undefined || files.default === undefined) {
    return undefined
  }
  const fallback = files.default
  return fromKeys(EXPRESSIONS, (expression) => assetUrl(files[expression] ?? fallback))
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
  return fromKeys(OUTFITS, (outfit) => accents?.[outfit] ?? fallback)
}
