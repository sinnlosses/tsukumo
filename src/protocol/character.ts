// キャラクター定義ファイル（character.json）を読み、表情・衣装から立ち絵の参照先を決める。
// 「読む」「決める」の両方を持つ小さいモジュール（キャラクター定義に閉じた変換なので分けるほど
// 概念が増えない。docs/architecture.md 原則5）。
//
// character.json は利用者が用意する外部由来のファイル（`characters/local/` に置く想定を含む）
// なので構造を信用しない。unknown で受けて検証し、壊れている・キーが無いときは undefined に落とす
// （docs/coding-standards.md「型を迂回するキャストを使わない」）。
//
// ファイルI/O（character.json 自体・立ち絵の画像ファイルを読むこと）は
// src/core/character-pack.ts に集約する。ここが返すのはファイル名の文字列までで、
// 実際に中身を読むのは呼び出し側。

import { type Expression, EXPRESSIONS, type Outfit } from "./expression.ts"

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
   * {@link expressionChoices} が表情名そのものをラベルにする。
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
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
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

/** `speak` で選べる表情1つ分。名前はコード側の語彙、ラベルは定義ファイル側の言葉。 */
export type ExpressionChoice = {
  readonly name: Expression
  readonly label: string
}

/**
 * `speak` ツールが受け付ける表情と、そのラベル。**出どころは定義ファイル**
 * （docs/architecture.md 原則4「キャラクターの中身をコードに書かない」）。
 *
 * - 選べるのは**立ち絵かラベルのどちらかが定義にある表情**（立ち絵が無い表情は `default` の
 *   絵に落ちるので、ラベルだけでも選ばせてよい。docs/requirements.md 4.4）
 * - **`default` は定義に無くても必ず含む**（未知の表情の落とし先なので、これが無いと
 *   受け付けられる名前が1つも無くなる）
 * - ラベルが定義に無ければ**表情名そのもの**をラベルにする（既定の日本語をコードに持たない）
 */
export function expressionChoices(
  definition: CharacterDefinition | undefined,
): readonly ExpressionChoice[] {
  if (definition === undefined) {
    return [{ name: "default", label: "default" }]
  }

  return EXPRESSIONS.filter(
    (expression) =>
      expression === "default" ||
      definition.portraits[expression] !== undefined ||
      definition.expressions[expression] !== undefined,
  ).map((expression) => ({
    name: expression,
    label: definition.expressions[expression] ?? expression,
  }))
}

/** 表情の一覧から名前だけを取り出す（`speak` の引数の照合など、ラベルが要らない側）。 */
export function expressionNames(choices: readonly ExpressionChoice[]): readonly Expression[] {
  return choices.map((choice) => choice.name)
}

/**
 * 表情に対応するラベルを解く。一覧に無い表情（定義から消えたあとに残った状態など）は
 * 表情名をそのまま返す。
 */
export function resolveExpressionLabel(
  choices: readonly ExpressionChoice[],
  expression: Expression,
): string {
  return choices.find((choice) => choice.name === expression)?.label ?? expression
}

/**
 * `/character/<file>` の URL の作り方。**`character.json` に書かれたファイル名だけ**を渡す前提
 * （`src/core/character-pack.ts` の allowlist と同じ考え方。パスから組み立てない）。
 */
export const CHARACTER_ASSET_PATH_PREFIX = "/character/"

export function characterAssetPath(fileName: string): string {
  return `${CHARACTER_ASSET_PATH_PREFIX}${fileName}`
}

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
  readonly outfitAccents: Readonly<Record<Outfit, string | undefined>>
  /** {@link CharacterDefinition.speechMarker} をそのまま持つ（畳み込みが行頭マーカーに使う）。 */
  readonly speechMarker: string | undefined
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
 * キャラクター定義を {@link CharacterInfo}（キャラビューに渡す形）にする。ファイル名を
 * {@link characterAssetPath} で URL に変える。定義が無い・壊れているときも、欠けた形
 * （立ち絵なし・`default` だけの表情）で返す。
 */
export function toCharacterInfo(
  definition: CharacterDefinition | undefined,
  pack: string | undefined,
): CharacterInfo {
  return {
    pack,
    name: definition?.name,
    accent: definition?.accent,
    expressions: expressionChoices(definition),
    portraits: portraitUrls(definition),
    outfitAccents: definition?.outfitAccents ?? EMPTY_OUTFIT_ACCENTS,
    speechMarker: definition?.speechMarker,
  }
}

function portraitUrls(
  definition: CharacterDefinition | undefined,
): Readonly<Record<Expression, string | undefined>> {
  if (definition === undefined) {
    return EMPTY_PORTRAITS
  }
  return {
    default: portraitUrl(definition.portraits.default),
    working: portraitUrl(definition.portraits.working),
    proud: portraitUrl(definition.portraits.proud),
    flustered: portraitUrl(definition.portraits.flustered),
  }
}

function portraitUrl(fileName: string | undefined): string | undefined {
  return fileName === undefined ? undefined : characterAssetPath(fileName)
}

const EMPTY_PORTRAITS: Readonly<Record<Expression, string | undefined>> = {
  default: undefined,
  working: undefined,
  proud: undefined,
  flustered: undefined,
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
 * 呼び出し側（`src/ui/character-view/portrait.tsx`）は立ち絵なし（吹き出しだけ）に
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

/**
 * 立ち絵ファイルの種類を拡張子だけで分ける。**利用者が `characters/local/` に置いた任意の
 * ファイルを無検証で流し込まないための最低限の仕分け**（このタスクの注意事項）。
 * SVG はインラインで埋め込む（ページの CSS 変数 `--outfit-accent` を効かせるため。
 * `<img>` で読み込むと独立した文書扱いになり届かない。実測は `characters/README.md`）。
 * それ以外は `<img>` で出す。対応しないラスタ形式（拡張子が既知のものでない）は undefined を返し、
 * 立ち絵なし扱いにする。
 */
export function classifyPortraitFile(fileName: string): "svg" | "raster" | undefined {
  const extension = fileExtension(fileName)
  if (extension === ".svg") {
    return "svg"
  }

  return RASTER_MIME_BY_EXTENSION[extension] === undefined ? undefined : "raster"
}

/** ラスタ画像の MIME タイプ。`classifyPortraitFile` が `"raster"` を返したときだけ意味を持つ。 */
export function rasterMimeType(fileName: string): string | undefined {
  return RASTER_MIME_BY_EXTENSION[fileExtension(fileName)]
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
    outfitAccents: toOutfitAccents(value.outfitAccents),
  }
}

function toExpressionLabels(source: unknown): Readonly<Record<Expression, string | undefined>> {
  const record = isRecord(source) ? source : {}
  return {
    default: stringField(record, "default"),
    working: stringField(record, "working"),
    proud: stringField(record, "proud"),
    flustered: stringField(record, "flustered"),
  }
}

function toPortraits(source: unknown): Readonly<Record<Expression, string | undefined>> {
  const record = isRecord(source) ? source : {}
  return {
    default: stringField(record, "default"),
    working: stringField(record, "working"),
    proud: stringField(record, "proud"),
    flustered: stringField(record, "flustered"),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const RASTER_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".")
  return dotIndex === -1 ? "" : fileName.slice(dotIndex).toLowerCase()
}
