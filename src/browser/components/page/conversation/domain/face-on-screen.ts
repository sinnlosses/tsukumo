// 立ち絵の顔の位置（絵の中の割合）を、画面（viewport）の座標へ直す。
// 測る・描くのは呼ぶ側で、ここは数だけを扱う。

import {
  DEFAULT_FACE_AT,
  type FaceAt,
} from "../../../../../shared/character-pack/character-definition.ts"

export type Point = { readonly x: number; readonly y: number }

export type Rect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** 立ち絵の絵（`pictureOnScreen`）を左右へ幅の 60% ずつ広げ、上端を高さの 10% 上・高さを 80% にした影の矩形を、領域の箱と交わる範囲に切る。 */
export function gloomOnScreen(input: { readonly portrait: Rect; readonly area: Rect }): Rect {
  const { portrait, area } = input
  const left = Math.max(portrait.left - portrait.width * 0.6, area.left)
  const top = Math.max(portrait.top - portrait.height * 0.1, area.top)
  const right = Math.min(portrait.left + portrait.width * 1.6, area.left + area.width)
  const bottom = Math.min(
    portrait.top - portrait.height * 0.1 + portrait.height * 0.8,
    area.top + area.height,
  )
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

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
  const picture = pictureOnScreen(input)
  return {
    x: picture.left + picture.width * faceAt.x,
    y: picture.top + picture.height * faceAt.y,
  }
}

/** 絵そのものが描かれる矩形。箱の下端に寄せ、縦横比を保って収まる（箱の上側には絵が無い余白が残る）。 */
export function pictureOnScreen(input: {
  readonly box: {
    readonly left: number
    readonly bottom: number
    readonly width: number
    readonly height: number
  }
  readonly naturalWidth: number
  readonly naturalHeight: number
}): Rect {
  const ratio =
    input.naturalWidth > 0 && input.naturalHeight > 0 ? input.naturalWidth / input.naturalHeight : 1
  const width = Math.min(input.box.width, input.box.height * ratio)
  const height = width / ratio
  return {
    left: input.box.left + (input.box.width - width) / 2,
    top: input.box.bottom - height,
    width,
    height,
  }
}
