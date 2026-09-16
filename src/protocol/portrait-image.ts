// 画面から届いた立ち絵1枚（data URL）。**受け取り方は data URL を JSON に載せて WebSocket の
// コマンドで渡す形**（`docs/design.md` 7.1。multipart の POST も生バイトの POST も採らない）。
//
// ここは両側で共有する契約なので、**検証だけを持ち、バイト列には触らない**（base64 を
// `Buffer` にするのは書き込む側 = `src/core/character-edit.ts`）。大きさの上限は base64 の
// 長さから計算するので、この層でデコードは要らない。
//
// **受け付ける種類は `.svg` / `.png` / `.gif` の3つだけ**（`docs/design.md` 7.1）。
// `classifyPortraitFile`（`src/protocol/character.ts`）はほかのラスタ形式も知っているが、
// **書き込む経路では allowlist をこの3つに絞る**（外から届いたものをそのままディスクに
// 置くため）。差し色が効くのはインラインで埋め込んだ SVG だけ（`characters/README.md`）。

import { type Expression } from "./expression.ts"

/** 画面から受け取れる立ち絵の形式。ファイル名の拡張子にもそのまま使う。 */
export type PortraitFormat = "svg" | "png" | "gif"

/** 立ち絵1枚（デコード後）の上限。`docs/design.md` 7.1 の表。 */
export const MAX_PORTRAIT_BYTES = 2 * 1024 * 1024

/**
 * data URL の文字列の上限。**デコード後の上限（{@link MAX_PORTRAIT_BYTES}）を base64 の
 * 長さに直したもの**に、`data:image/svg+xml;base64,` の前置きぶんの余裕を足してある。
 * 文字列の長さで先に切るので、巨大な値の中身を見る前に弾ける。
 */
export const MAX_PORTRAIT_DATA_URL_LENGTH = Math.ceil(MAX_PORTRAIT_BYTES / 3) * 4 + 100

/** 画面から届いた立ち絵1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type PortraitImage = {
  readonly format: PortraitFormat
  readonly base64: string
}

/**
 * data URL を立ち絵1枚として読む。**読めない・受け付けない種類・大きすぎる**ときは undefined
 * （呼び出し側は定型文の `error` を返すだけで、届いた値を理由に混ぜない）。
 */
export function parsePortraitImage(dataUrl: string): PortraitImage | undefined {
  if (dataUrl.length > MAX_PORTRAIT_DATA_URL_LENGTH) {
    return undefined
  }

  const matched = DATA_URL_PATTERN.exec(dataUrl)
  const mediaType = matched?.[1]
  const base64 = matched?.[2]
  if (mediaType === undefined || base64 === undefined) {
    return undefined
  }

  const format = PORTRAIT_FORMAT_BY_MEDIA_TYPE[mediaType.toLowerCase()]
  if (format === undefined || decodedBase64Length(base64) > MAX_PORTRAIT_BYTES) {
    return undefined
  }

  return { format, base64 }
}

/**
 * 書き込む先のファイル名。**表情の名前から組み立てる**ので、外から届いた文字列がパスの一部に
 * ならない（`docs/design.md` 7.1 の「名前をパスとして組み立てない」を、名前を受け取らないことで
 * 満たす）。同じ表情を差し替えたときは同じ名前を上書きする。
 */
export function portraitFileName(expression: Expression, format: PortraitFormat): string {
  return `${expression}.${format}`
}

/**
 * base64 の文字列が表すバイト数。**デコードせずに長さから計算する**（両側で共有する契約に
 * バイト列を持ち込まないため）。
 */
function decodedBase64Length(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor(base64.length / 4) * 3 - padding
}

/**
 * `data:<media type>;base64,<payload>` だけを受け付ける（`;base64` の無い形・`charset` などの
 * 付属の指定が付いた形は受け取らない — 画面が `FileReader.readAsDataURL` で作る形に絞る）。
 */
const DATA_URL_PATTERN = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i

const PORTRAIT_FORMAT_BY_MEDIA_TYPE: Readonly<Record<string, PortraitFormat>> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/gif": "gif",
}
