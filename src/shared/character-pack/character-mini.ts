// レポートの筆先に添うミニ立ち絵（`character.json` の `mini`）を画面から差し替える／外す。
// 形式・大きさの上限とも、立ち絵の検証（`parsePortraitImage`）にそのまま乗せる。

import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  parsePortraitImage,
  type PortraitFormat,
  type PortraitImage,
} from "./portrait-image.ts"

/** 画面から受け取れるミニ立ち絵の形式。立ち絵と同じ3つ。 */
export type MiniFormat = PortraitFormat

export const MAX_MINI_DATA_URL_LENGTH = MAX_PORTRAIT_DATA_URL_LENGTH

/** 画面から届いたミニ立ち絵1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type MiniImage = PortraitImage

/** data URL をミニ立ち絵1枚として読む。読めない・受け付けない種類・大きすぎるときは undefined。 */
export const parseMiniImage: (dataUrl: string) => MiniImage | undefined = parsePortraitImage

/**
 * 書き込む先のファイル名。形式からだけ組み立てるので、届いた文字列がパスの一部にならない。
 * 差し替えは同じ名前の上書きになる。
 */
export function miniFileName(format: MiniFormat): string {
  return `${MINI_FILE_BASE_NAME}.${format}`
}

const MINI_FILE_BASE_NAME = "mini"
