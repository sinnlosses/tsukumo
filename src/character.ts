// キャラクター定義ファイル（character.json）を読み、表情・衣装から立ち絵の参照先を決める。
// 「読む」「決める」の両方を持つ小さいモジュール（キャラクター定義に閉じた変換なので分けるほど
// 概念が増えない。docs/architecture.md 原則5）。
//
// character.json は利用者が用意する外部由来のファイル（`characters/local/` に置く想定を含む）
// なので構造を信用しない。unknown で受けて検証し、壊れている・キーが無いときは undefined に落とす
// （docs/coding-standards.md「型を迂回するキャストを使わない」）。
//
// ファイルI/O（character.json 自体・立ち絵の画像ファイルを読むこと）は src/index.ts に集約する。
// ここが返すのはファイル名の文字列までで、実際に中身を読むのは呼び出し側。

import { type Expression, type Outfit } from "./expression.ts"

/**
 * character.json の中身。`portraits` / `outfitAccents` は「あるものだけでよい」
 * （docs/requirements.md 4.4）。無い表情・衣装はキーごと消すのではなく値を undefined にして持つ
 * （`?:` は使わない。docs/coding-standards.md「無いかもしれない値」）。
 */
export type CharacterDefinition = {
  readonly name: string | undefined
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

/**
 * 表情に対応する立ち絵のファイル名を決める。該当する表情の指定が無ければ `default` に落ちる
 * （docs/requirements.md 4.4「あるものだけでよい」）。`default` も無ければ undefined を返し、
 * 呼び出し側は立ち絵なし（吹き出しだけ）にフォールバックする。
 */
export function resolvePortraitFile(
  definition: CharacterDefinition,
  expression: Expression,
): string | undefined {
  return definition.portraits[expression] ?? definition.portraits.default
}

/** 衣装に対応する差し色を決める。該当する衣装の指定が無ければ `default` に落ちる。 */
export function resolveOutfitAccent(
  definition: CharacterDefinition,
  outfit: Outfit,
): string | undefined {
  return definition.outfitAccents[outfit] ?? definition.outfitAccents.default
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

/**
 * 読み込んだファイルの中身が SVG らしいかどうかの簡易な判定。**厳密な検証はしない**
 * （フルパースは過剰）。拡張子は `.svg` でも中身が壊れている・別形式のときにここで弾き、
 * 立ち絵なしのフォールバックへ落とす。
 */
export function isPlausibleSvgMarkup(content: string): boolean {
  const trimmed = content.trimStart().toLowerCase()
  return trimmed.startsWith("<svg") || trimmed.startsWith("<?xml")
}

function toCharacterDefinition(value: unknown): CharacterDefinition | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    portraits: toPortraits(value.portraits),
    outfitAccents: toOutfitAccents(value.outfitAccents),
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
