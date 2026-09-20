// 画面から届いた立ち絵1枚（data URL）。**受け取り方は data URL を JSON に載せて WebSocket の
// コマンドで渡す形**（`docs/design.md` 7.1。multipart の POST も生バイトの POST も採らない）。
//
// ここは両側で共有する契約なので、**検証だけを持ち、バイト列には触らない**（base64 を
// `Buffer` にするのは書き込む側 = `src/server/adapter/character-edit.ts`）。data URL としての
// 読み取りと大きさの検査は `src/shared/image-data-url.ts` にあり、ここが足すのは
// **立ち絵として受け付ける形式の表**とファイル名の組み立て。
//
// **受け付ける種類は `.svg` / `.png` / `.gif` の3つだけ**（`docs/design.md` 7.1）。
// `classifyPortraitFile`（`src/shared/character-asset.ts`）はほかのラスタ形式も知っているが、
// **書き込む経路では allowlist をこの3つに絞る**（外から届いたものをそのままディスクに
// 置くため）。差し色が効くのはインラインで埋め込んだ SVG だけ（`characters/README.md`）。

import { type Expression } from "./expression.ts"
import { maxImageDataUrlLength, parseImageDataUrl } from "./image-data-url.ts"

/** 画面から受け取れる立ち絵の形式。ファイル名の拡張子にもそのまま使う。 */
export type PortraitFormat = "svg" | "png" | "gif"

/** 立ち絵1枚（デコード後）の上限。`docs/design.md` 7.1 の表。 */
export const MAX_PORTRAIT_BYTES = 2 * 1024 * 1024

/** data URL の文字列の上限（{@link MAX_PORTRAIT_BYTES} を base64 の長さに直したもの）。 */
export const MAX_PORTRAIT_DATA_URL_LENGTH = maxImageDataUrlLength(MAX_PORTRAIT_BYTES)

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
  const image = parseImageDataUrl(dataUrl, MAX_PORTRAIT_BYTES)
  if (image === undefined) {
    return undefined
  }

  const format = PORTRAIT_FORMAT_BY_MEDIA_TYPE[image.mediaType]
  return format === undefined ? undefined : { format, base64: image.base64 }
}

/**
 * 書き込む先のファイル名。**表情の名前から組み立てる**ので、外から届いた文字列がパスの一部に
 * ならない（`docs/design.md` 7.1 の「名前をパスとして組み立てない」を、名前を受け取らないことで
 * 満たす）。同じ表情を差し替えたときは同じ名前を上書きする。
 */
export function portraitFileName(expression: Expression, format: PortraitFormat): string {
  return `${expression}.${format}`
}

const PORTRAIT_FORMAT_BY_MEDIA_TYPE: Readonly<Record<string, PortraitFormat>> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/gif": "gif",
}
