// いま出しているキャラクターの姿（`CharacterInfo`）と、パックの一覧の1件（`CharacterPackEntry`）・パックの名前。
// 画面が読む形で、定義ファイルの生の形から `toCharacterInfo` が1回だけ変換する。
// 立ち絵の中身は持たない（`portraits` の値は `/character/<pack>/<file>` の URL）。

import { fromKeys } from "remeda"

import { characterAssetPath } from "./character-asset.ts"
import type { CharacterBackground } from "./character-background.ts"
import type { CharacterDefinition } from "./character-definition.ts"
import type { CharacterPackName } from "./character-pack-name.ts"
import { type ExpressionChoice, expressionChoices } from "./expression-choice.ts"
import { type Expression, EXPRESSIONS } from "./expression.ts"

/**
 * キャラビューに渡す、キャラクターパックの姿（`character-changed` イベント・`SessionState.character` の中身）。
 * `portraits` の値は `/character/<pack>/<file>` の URL（ファイル名ではない。素材の中身はここにもイベントにも乗せない）。
 */
export type CharacterInfo = {
  /**
   * いま出しているキャラクターパックの名前（`characters/<pack>` のディレクトリ名）。
   * `session.switchCharacter` の鍵で、素材の URL の `<pack>` の区間もこれ。
   */
  readonly pack: CharacterPackName
  readonly name?: string
  /** {@link CharacterDefinition.accent} をそのまま持つ。ブラウザ側は `--accent` に流す。 */
  readonly accent?: string
  /** {@link CharacterDefinition.chatAccent} をそのまま持つ。雑談中だけ `--accent` に流す（{@link effectiveAccent}）。 */
  readonly chatAccent?: string
  readonly expressions: readonly ExpressionChoice[]
  /**
   * 表情 → 立ち絵の URL。`default` に畳み済みの全域な表で、読む側は表を引くだけでよい（立ち絵の無い表情には `default` の絵が入っている）。
   * `default` すら無いパックでは undefined（立ち絵そのものが出ない）。
   */
  readonly portraits?: Readonly<Record<Expression, string>>
  /**
   * 立ち絵を定義に自分で持っている表情（`EXPRESSIONS` の順）。
   * `portraits` は畳んだあとの表で「この表情だけ無い」が読めないので、それが要るキャラクター画面（まだ入れていない枠・消す口）のためにここで持つ。
   * `speak` の選択肢（`expressions`）とは別物。
   */
  readonly expressionsWithPortrait: readonly Expression[]
  /**
   * ミニ立ち絵の URL（`/character/<pack>/<file>`）。
   * 定義に `mini` が無ければ `portraits.default` に落として持つので、読む側は「あるかどうか」だけを見れば足りる（縮小するのは画面側）。
   * `default` も無いパックでは undefined（ミニ立ち絵そのものが出ない）。
   */
  readonly mini?: string
  /**
   * 定義に `mini` を自分で持つか。
   * `mini` は `portraits.default` に落ちた後の URL で「持つか」が読めないので、それが要るキャラクター画面（縮図を出すか空の枠か）のためにここで持つ。
   */
  readonly hasOwnMini: boolean
  /**
   * 帯の左端に出す顔の URL（`/character/<pack>/<file>`）。表情では変わらない1枚。
   * 定義に `face` が無いパックでは undefined で、`portraits.default` へのフォールバックはしない（帯に何も出さない）。
   */
  readonly face?: string
  /** {@link CharacterDefinition.tagline}（自己紹介文）をそのまま持つ。無いパックでは undefined（名前だけ）。 */
  readonly tagline?: string
  /** {@link CharacterDefinition.userCall}（利用者の呼び名）をそのまま持つ。無いパックでは undefined。 */
  readonly userCall?: string
  /** {@link CharacterDefinition.miniCall}（ミニ立ち絵の呼び名）をそのまま持つ。無いパックでは undefined。 */
  readonly miniCall?: string
  /**
   * キャラビューに敷く背景。`image` は `/character/<pack>/<file>` の URL（立ち絵と同じ経路・同じ取り直しの印）。
   * 無ければ背景は出ない（`ground` の上に立ち絵が直接立つ）。
   */
  readonly background?: CharacterBackground
  /**
   * 日記の本文に効かせる書体の URL（`/character/<pack>/<file>`）。
   * 定義に `diaryFont` が無いパックでは undefined（`--font-serif` のまま）。
   */
  readonly diaryFont?: string
  /**
   * 立ち絵と差し色を画面から変えられるか。
   * 変えた結果の書き込み先は `~/.tsukumo/characters/<name>/` の1箇所だけで、そこに書いた版が探索の順で起動先の `characters/local` に負けるパックだけが false になる（書いても次の起動で読まれないので、画面から口を出さない）。
   */
  readonly editable: boolean
}

/**
 * 切り替えの選択肢1つ分（サイドバーの `<select>`）。
 * `name` は `characters/<name>` のディレクトリ名で、`label` は画面に出す名前（`character.json` の `name`。無ければ `name`）。
 */
export type CharacterPackChoice = {
  readonly name: CharacterPackName
  readonly label: string
}

/**
 * パックの一覧の1件（`character-changed` の `packs` と `SessionState.characterPacks` の中身）。
 * 使用中以外のパックも同じ形で全部持つ。
 * 「変えられるか」は `character.editable` にあり、ここには重ねて持たない。
 */
export type CharacterPackEntry = CharacterPackChoice & {
  readonly character: CharacterInfo
  /** いま出しているパックか（一覧の中でちょうど1件だけ true。サーバが決める）。 */
  readonly inUse: boolean
  /**
   * 画面から消すと何が起きるか（サーバが決める。{@link CharacterPackRemoval}）。
   * 使用中かどうかは混ぜない。押せなくするのは画面が {@link inUse} を見て行う（サーバも使用中は断る）。
   */
  readonly removal: CharacterPackRemoval
  /** 人格（`persona.md`）の `## 覚えたこと` より前の本文。無いパックは空文字。 */
  readonly personaBody: string
}

/**
 * パックを画面から消したときに起きること。
 * 消すのはいつもホーム（`~/.tsukumo/characters/<name>/`）の版だけで、違いは消したあとに一覧に何が残るか。
 *
 * - `"delete"`: ホームにしか無いパック。一覧から消え、あらすじと会話のアーカイブも一緒に消える
 * - `"revert-to-bundled"`: 同梱のパックを画面で直したもの。ホームの版が消えて同梱の版が一覧に戻る
 *   （画面で直したことと、キャラクター自身が人格に書き足した「覚えたこと」が消える。あらすじと会話のアーカイブは残る）
 * - `"none"`: 画面からは消せない（同梱だけ・起動先の `characters/local`・一覧の外を指した `TSUKUMO_CHARACTER`）
 */
export type CharacterPackRemoval = "delete" | "revert-to-bundled" | "none"

export {
  type CharacterPackName,
  characterPackNameSchema,
  parseCharacterPackName,
} from "./character-pack-name.ts"

/** {@link toCharacterInfo} に渡すもの。パックそのもの（`adapter` の型）はここでは知らない。 */
export type CharacterInfoSource = {
  readonly definition?: CharacterDefinition
  /** `characters/<name>` のディレクトリ名。素材の URL の `<pack>` の区間にもなる。 */
  readonly pack: CharacterPackName
  /** 素材の版（素材の URL に付ける取り直しの印 `?v=`。無ければ付けない）。 */
  readonly revision?: string
  readonly editable: boolean
}

/**
 * `character.json` の中身を {@link CharacterInfo}（キャラビューに渡す形）にする。ファイル名を {@link characterAssetPath} で URL に変える。
 * 定義が無い・壊れているときも、欠けた形（立ち絵なし・`default` だけの表情）で返す。
 * 「この表情だけ無い」はここで `default` に畳み、読む側へ運ばない。
 */
export function toCharacterInfo(source: CharacterInfoSource): CharacterInfo {
  const definition = source.definition
  const assetUrl = (fileName: string): string =>
    characterAssetPath(source.pack, fileName, source.revision)
  const portraits = definition === undefined ? undefined : portraitUrls(definition, assetUrl)
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
    hasOwnMini: definition?.mini !== undefined,
    face: definition?.face === undefined ? undefined : assetUrl(definition.face),
    tagline: definition?.tagline,
    userCall: definition?.userCall,
    miniCall: definition?.miniCall,
    background:
      definition?.background === undefined
        ? undefined
        : backgroundWithUrl(definition.background, assetUrl),
    diaryFont: definition?.diaryFont === undefined ? undefined : assetUrl(definition.diaryFont),
    editable: source.editable,
  }
}

/**
 * 画面に流し込む `--accent` の値。
 * 雑談中だけ {@link CharacterInfo.chatAccent} を使い、無ければ {@link CharacterInfo.accent} に落ちる。
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
  background: CharacterBackground,
  assetUrl: (fileName: string) => string,
): CharacterBackground {
  return { image: assetUrl(background.image), veil: background.veil }
}

/**
 * 立ち絵の表を `default` に畳んだ全域な形にする。
 * `default` すら無いパックでは表ごと持たない（落とし先が無いので、他の表情の絵があっても立ち絵なし＝吹き出しだけにフォールバックする）。
 */
function portraitUrls(
  definition: CharacterDefinition,
  assetUrl: (fileName: string) => string,
): Readonly<Record<Expression, string>> | undefined {
  const files = definition.portraits
  if (files.default === undefined) {
    return undefined
  }
  const fallback = files.default
  return fromKeys(EXPRESSIONS, (expression) => assetUrl(files[expression] ?? fallback))
}
