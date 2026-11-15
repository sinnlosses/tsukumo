// 同じ大きさの2枚の画素（RGBA）を比べて、変わった画素を全部含む1つの枠を画像に対する%で返す。
// 前後の画像の対で、書き手が `region` を渡さなかったときの「変わった場所」の枠に使う。

import type { ImageRegion } from "../../../../shared/report/report-image.ts"

/**
 * 色が変わったとみなすチャンネルごとの差（0〜255）。
 * 同じ画面を撮り直したときの圧縮・縮小の揺れ（数値で十数）を拾わず、文字の色の入れ替わりや面の塗り替え（数十以上）を拾う値。
 */
const CHANGED_CHANNEL_TOLERANCE = 32

/** 枠が画の面積のこの割合を超えたら、変わった場所を絞れていないとみなして囲まない。 */
const MAX_REGION_AREA_RATIO = 0.5

const CHANNELS = 4

const NO_REGION = { kind: "none" } as const

export type ChangedRegion =
  | typeof NO_REGION
  | { readonly kind: "region"; readonly region: ImageRegion }

/**
 * `before` と `after` は `width * height` 画素の RGBA の並び。長さが合わないときと、変わった画素が無いとき、
 * 枠が {@link MAX_REGION_AREA_RATIO} を超えるときは枠なし。
 */
export function findChangedRegion(
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  width: number,
  height: number,
): ChangedRegion {
  const length = width * height * CHANNELS
  if (width <= 0 || height <= 0 || before.length !== length || after.length !== length) {
    return NO_REGION
  }
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * CHANNELS
      if (pixelChanged(before, after, offset)) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX < 0) {
    return NO_REGION
  }
  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1
  if (boxWidth * boxHeight > width * height * MAX_REGION_AREA_RATIO) {
    return NO_REGION
  }
  return {
    kind: "region",
    region: {
      left: (minX / width) * 100,
      top: (minY / height) * 100,
      width: (boxWidth / width) * 100,
      height: (boxHeight / height) * 100,
    },
  }
}

function pixelChanged(
  before: ArrayLike<number>,
  after: ArrayLike<number>,
  offset: number,
): boolean {
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    const a = before[offset + channel] ?? 0
    const b = after[offset + channel] ?? 0
    if (Math.abs(a - b) > CHANGED_CHANNEL_TOLERANCE) {
      return true
    }
  }
  return false
}
