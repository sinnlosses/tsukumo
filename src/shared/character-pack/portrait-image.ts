// 画面から届いた立ち絵1枚（data URL を JSON に載せて WebSocket のコマンドで渡す）の検証と、書き込む先のファイル名。
// 検証だけを持ち、バイト列には触らない（base64 を `Buffer` にするのは書き込む側）。
//
// 受け付ける種類は `.svg` / `.png` / `.gif` の3つだけ。
// `classifyPortraitFile` はほかのラスタ形式も知っているが、書き込む経路では外から届いたものをそのままディスクに置くので、allowlist をこの3つに絞る。

import { maxImageDataUrlLength, parseImageDataUrl } from "../utils/image-data-url.ts"
import type { Expression } from "./expression.ts"

/** 画面から受け取れる立ち絵の形式。ファイル名の拡張子にもそのまま使う。 */
export type PortraitFormat = "svg" | "png" | "gif"

/** 立ち絵1枚（デコード後）の上限。 */
export const MAX_PORTRAIT_BYTES = 2 * 1024 * 1024

/** data URL の文字列の上限（{@link MAX_PORTRAIT_BYTES} を base64 の長さに直したもの）。 */
export const MAX_PORTRAIT_DATA_URL_LENGTH = maxImageDataUrlLength(MAX_PORTRAIT_BYTES)

/** 画面から届いた立ち絵1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type PortraitImage = {
  readonly format: PortraitFormat
  readonly base64: string
}

/**
 * data URL を立ち絵1枚として読む。読めない・受け付けない種類・大きすぎるときは undefined
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
 * 書き込む先のファイル名。表情の名前から組み立てるので、外から届いた文字列がパスの一部にならない。
 * 同じ表情を差し替えたときは同じ名前を上書きする。
 */
export function portraitFileName(expression: Expression, format: PortraitFormat): string {
  return `${expression}.${format}`
}

const PORTRAIT_FORMAT_BY_MEDIA_TYPE: Readonly<Record<string, PortraitFormat>> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/gif": "gif",
}
