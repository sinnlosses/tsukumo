// 帯の左端・一覧の丸・名乗りの大きな丸に出す顔（`character.json` の `face`。
// `docs/screen-design.md` 13.9「顔」）を画面から差し替える／外す。
//
// **立ち絵と同じ種類のファイルを受け付ける**（`docs/screen-design.md` 13.9「顔」の決定）。
// 顔は正方形を勧める1枚絵で、写真が主な素材の背景（`.png` / `.jpg` / `.webp`）とは性質が違い、
// 立ち絵と同じ「キャラクターの絵」という素材なので、形式・大きさの上限とも
// `src/shared/portrait-image.ts` にそのまま乗せる（二重に持たない）。

import {
  MAX_PORTRAIT_DATA_URL_LENGTH,
  parsePortraitImage,
  type PortraitFormat,
  type PortraitImage,
} from "./portrait-image.ts"

/** 画面から受け取れる顔の形式。立ち絵と同じ3つ（`docs/screen-design.md` 13.9「顔」）。 */
export type FaceFormat = PortraitFormat

/** 顔1枚（デコード後）の上限。立ち絵と同じ（`src/shared/portrait-image.ts` の `MAX_PORTRAIT_BYTES`）。 */
export const MAX_FACE_DATA_URL_LENGTH = MAX_PORTRAIT_DATA_URL_LENGTH

/** 画面から届いた顔1枚。`base64` は data URL の `,` より後ろ（そのままの文字列）。 */
export type FaceImage = PortraitImage

/**
 * data URL を顔1枚として読む。**読めない・受け付けない種類・大きすぎる**ときは undefined
 * （立ち絵の検証〔`parsePortraitImage`〕をそのまま使う）。
 */
export const parseFaceImage: (dataUrl: string) => FaceImage | undefined = parsePortraitImage

/**
 * 書き込む先のファイル名。**形式からだけ組み立てる**ので、届いた文字列がパスの一部にならない
 * （背景と同じ考え方。`src/shared/character-background.ts` の `backgroundFileName`）。差し替えは
 * 同じ名前の上書きになる。
 */
export function faceFileName(format: FaceFormat): string {
  return `${FACE_FILE_BASE_NAME}.${format}`
}

const FACE_FILE_BASE_NAME = "face"
