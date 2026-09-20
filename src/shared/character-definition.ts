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

import { type CharacterBackground, toCharacterBackground } from "./character-background.ts"
import { type Expression, type Outfit, type RemovableExpression } from "./expression.ts"

/**
 * character.json の中身。`portraits` / `outfitAccents` は「あるものだけでよい」
 * （docs/requirements.md 4.4）。無い表情・衣装はキーごと消すのではなく値を undefined にして持つ
 * （`?:` は使わない。docs/coding-standards.md「無いかもしれない値」）。
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
   * セリフの行頭マーカー（`speak` が呼ばれなかったターンの補助。docs/requirements.md 4.2）。
   * **定義に無ければ補助そのものが効かない**（`speak` だけがセリフの経路になる）。
   * 既定値をコードに持たないのは、マーカーがキャラクターの名前だから（原則4）。
   */
  readonly speechMarker: string | undefined
  /**
   * キャラクターの色（`docs/design.md` 13.2 の `accent`）。**衣装ごとの差し色
   * （`outfitAccents`）とは別物**で、立ち絵の中だけでなく画面全体（吹き出し・選ばれたタブ・
   * フォーカスの輪など、13.1 原則1が許す場所）に効く。無ければ画面側の既定値に落ちる。
   */
  readonly accent: string | undefined
  readonly portraits: Readonly<Record<Expression, string | undefined>>
  /**
   * ミニ立ち絵の素材のファイル名（レポートの筆先に添う1体。docs/requirements.md 4.3）。
   * **任意**で、無いパックは `portraits.default` の縮小に落ちる（4.4「あるものだけでよい」に
   * 例外を作らない）。表情では変わらないので `portraits` とは別の1件で持つ。
   */
  readonly mini: string | undefined
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
  /**
   * キャラビューに敷く背景（`docs/design.md` 13.8）。**素材のファイル名と覆いの不透明度**の
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
 * 背景の素材を差し替えた JSON を返す。**覆いの不透明度（`veil`）はそのまま残す** — 画面から
 * 変えられるのは素材だけで、濃さは定義ファイルを手で直す（`docs/design.md` 13.6 / 13.8）。
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
  if (!isRecord(value)) {
    return undefined
  }

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    accent: typeof value.accent === "string" ? value.accent : undefined,
    expressions: toExpressionLabels(value.expressions),
    speechMarker: typeof value.speechMarker === "string" ? value.speechMarker : undefined,
    portraits: toPortraits(value.portraits),
    mini: typeof value.mini === "string" ? value.mini : undefined,
    outfitAccents: toOutfitAccents(value.outfitAccents),
    background: toCharacterBackground(value.background),
  }
}

function toExpressionLabels(source: unknown): Readonly<Record<Expression, string | undefined>> {
  const record = isRecord(source) ? source : {}
  return {
    default: stringField(record, "default"),
    thinking: stringField(record, "thinking"),
    proud: stringField(record, "proud"),
    flustered: stringField(record, "flustered"),
    serious: stringField(record, "serious"),
    curious: stringField(record, "curious"),
  }
}

function toPortraits(source: unknown): Readonly<Record<Expression, string | undefined>> {
  const record = isRecord(source) ? source : {}
  return {
    default: stringField(record, "default"),
    thinking: stringField(record, "thinking"),
    proud: stringField(record, "proud"),
    flustered: stringField(record, "flustered"),
    serious: stringField(record, "serious"),
    curious: stringField(record, "curious"),
  }
}

function toOutfitAccents(source: unknown): Readonly<Record<Outfit, string | undefined>> {
  const record = isRecord(source) ? source : {}
  return {
    default: stringField(record, "default"),
    light: stringField(record, "light"),
    normal: stringField(record, "normal"),
    heavy: stringField(record, "heavy"),
  }
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
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
  const source = asRecord(content === undefined ? undefined : parseJson(content))
  const edited = { ...asRecord(source[group]), [key]: value }
  return `${JSON.stringify({ ...source, [group]: edited }, undefined, 2)}\n`
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
