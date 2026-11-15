// 読み込みが済んだ前後の2枚の画を画素で比べて、変わった範囲の枠を返す。DOM と canvas に触る側の薄い包みで、比べの決まりは `findChangedRegion`。

import { type ChangedRegion, findChangedRegion } from "../domain/changed-region.ts"

/** 比べる前に縮める長い辺の上限（画素）。大きな画でも比べを数十ミリ秒に収める。 */
const MAX_COMPARE_SIDE = 640

const NO_REGION = { kind: "none" } as const

/** 2枚の大きさ（自然な幅・高さ）が同じときだけ比べる。canvas が使えない環境では枠なし。 */
export function compareLoadedImages(
  before: HTMLImageElement,
  after: HTMLImageElement,
): ChangedRegion {
  const { naturalWidth: width, naturalHeight: height } = before
  if (
    width === 0 ||
    height === 0 ||
    after.naturalWidth !== width ||
    after.naturalHeight !== height
  ) {
    return NO_REGION
  }
  const scale = Math.min(1, MAX_COMPARE_SIDE / Math.max(width, height))
  const drawWidth = Math.max(1, Math.round(width * scale))
  const drawHeight = Math.max(1, Math.round(height * scale))
  const beforePixels = readPixels(before, drawWidth, drawHeight)
  const afterPixels = readPixels(after, drawWidth, drawHeight)
  return findChangedRegion(beforePixels, afterPixels, drawWidth, drawHeight)
}

/** canvas が使えないときは空の並びを返す（`findChangedRegion` が長さの不一致で枠なしにする）。 */
function readPixels(image: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (context === null) {
    return new Uint8ClampedArray(0)
  }
  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height).data
}
