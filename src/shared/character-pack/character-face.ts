// 帯の左端・一覧の丸・名乗りの大きな丸に出す顔（`character.json` の `face`）を画面から差し替える／外す。
// 形式・大きさの上限とも、立ち絵の検証（`parsePortraitImage`）にそのまま乗せる。

import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  parsePortraitImage,
  type PortraitFormat,
  type PortraitImage,
} from "./portrait-image.ts"

/** 画面から受け取れる顔の形式。立ち絵と同じ3つ。 */
export type FaceFormat = PortraitFormat

export const MAX_FACE_DATA_URL_LENGTH = MAX_PORTRAIT_DATA_URL_LENGTH

/** 画面から届いた顔1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type FaceImage = PortraitImage

/** data URL を顔1枚として読む。読めない・受け付けない種類・大きすぎるときは undefined。 */
export const parseFaceImage: (dataUrl: string) => FaceImage | undefined = parsePortraitImage

/**
 * 書き込む先のファイル名。形式からだけ組み立てるので、届いた文字列がパスの一部にならない。
 * 差し替えは同じ名前の上書きになる。
 */
export function faceFileName(format: FaceFormat): string {
  return `${FACE_FILE_BASE_NAME}.${format}`
}

const FACE_FILE_BASE_NAME = "face"
