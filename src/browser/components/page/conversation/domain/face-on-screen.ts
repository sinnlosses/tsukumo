// 立ち絵の顔の位置（絵の中の割合）を、画面（viewport）の座標へ直す。
// 測る・描くのは呼ぶ側で、ここは数だけを扱う。

import {
  DEFAULT_FACE_AT,
  type FaceAt,
} from "../../../../../shared/character-pack/character-definition.ts"

export type Point = { readonly x: number; readonly y: number }

/** パックの `faceAt`（無ければ既定）を、立ち絵の箱と絵の縦横比から画面の座標にする。絵は箱の下端に寄せ、縦横比を保って収まる。 */
export function faceOnScreen(input: {
  readonly box: {
    readonly left: number
    readonly bottom: number
    readonly width: number
    readonly height: number
  }
  readonly naturalWidth: number
  readonly naturalHeight: number
  readonly faceAt?: FaceAt
}): Point {
  const faceAt = input.faceAt ?? DEFAULT_FACE_AT
  const ratio =
    input.naturalWidth > 0 && input.naturalHeight > 0 ? input.naturalWidth / input.naturalHeight : 1
  const width = Math.min(input.box.width, input.box.height * ratio)
  const height = width / ratio
  return {
    x: input.box.left + (input.box.width - width) / 2 + width * faceAt.x,
    y: input.box.bottom - height + height * faceAt.y,
  }
}
