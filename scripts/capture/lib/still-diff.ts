// 静止しなかったときに、最後の2枚の撮影のどこが違ったかを言葉にする。

import pixelmatch from "pixelmatch"

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
  // 閾値 0・縁のなだらかさの見逃し無しで、1 画素でも違えば数える。
  // diffMask では違った画素だけが不透明で出力に描かれる。
  const mask = new Uint8Array(a.width * a.height * 4)
  const count = pixelmatch(a.pixels, b.pixels, mask, a.width, a.height, {
    threshold: 0,
    includeAA: true,
    diffMask: true,
  })
  if (count === 0) {
    return "画素は同じでバイトだけ違う"
  }
  let box: DiffBox = { left: a.width, top: a.height, right: -1, bottom: -1 }
  for (let index = 0; index < a.width * a.height; index++) {
    if (mask[index * 4 + 3] === 0) {
      continue
    }
    const x = index % a.width
    const y = Math.floor(index / a.width)
    box = {
      left: Math.min(box.left, x),
      top: Math.min(box.top, y),
      right: Math.max(box.right, x),
      bottom: Math.max(box.bottom, y),
    }
  }
  return `${String(count)} 画素が違う（x ${String(box.left)}-${String(box.right)}、y ${String(box.top)}-${String(box.bottom)}、領域 ${String(a.width)}x${String(a.height)}）`
}
