// 静止しなかったときに、最後の2枚の撮影のどこが違ったかを言葉にする。

import { decodePng } from "./png-pixel.ts"

/** 違った画素を囲む箱（撮った範囲の左上を 0 とする px）。 */
type DiffBox = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * 同じ範囲を撮った2枚の PNG を画素で比べ、違った画素の数と囲む箱を一文にする。
 * 大きさが違えば大きさの違いを、画素が同じでバイトだけ違えば画素は同じと言う。
 */
export function describeStillDiff(before: Buffer, after: Buffer): string {
  const a = decodePng(before)
  const b = decodePng(after)
  if (a.width !== b.width || a.height !== b.height) {
    return `大きさが違う（${String(a.width)}x${String(a.height)} → ${String(b.width)}x${String(b.height)}）`
  }
  let count = 0
  let box: DiffBox | undefined
  for (let index = 0; index < a.width * a.height; index++) {
    const offset = index * 4
    const same =
      a.pixels[offset] === b.pixels[offset] &&
      a.pixels[offset + 1] === b.pixels[offset + 1] &&
      a.pixels[offset + 2] === b.pixels[offset + 2] &&
      a.pixels[offset + 3] === b.pixels[offset + 3]
    if (same) {
      continue
    }
    count += 1
    const x = index % a.width
    const y = Math.floor(index / a.width)
    box =
      box === undefined
        ? { left: x, top: y, right: x, bottom: y }
        : {
            left: Math.min(box.left, x),
            top: Math.min(box.top, y),
            right: Math.max(box.right, x),
            bottom: Math.max(box.bottom, y),
          }
  }
  if (box === undefined) {
    return "画素は同じでバイトだけ違う"
  }
  return `${String(count)} 画素が違う（x ${String(box.left)}-${String(box.right)}、y ${String(box.top)}-${String(box.bottom)}、領域 ${String(a.width)}x${String(a.height)}）`
}
