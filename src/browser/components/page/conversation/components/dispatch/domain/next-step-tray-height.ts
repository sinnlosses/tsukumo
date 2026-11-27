// 次の一手の札の並びの高さの上限。`localStorage` に px だけ保存する。
// 読めない・まだ動かしていないときは undefined で、CSS の既定（3段）に任せる。

import { z } from "zod"

import {
  localPreference,
  type LocalPreferenceCodec,
} from "../../../../../../utils/local-preference.ts"

/** 札1段の高さ。CSS の `--_chip-height`（1.875rem）と揃える。これより低くすると札が読めない。 */
const MIN_HEIGHT_PX = 30

const savedHeight = z.number().min(MIN_HEIGHT_PX).optional()

// 既定に戻した（undefined）は空文字で保存し、読むと最小を割って undefined に畳まれる。
const pxCodec: LocalPreferenceCodec<z.infer<typeof savedHeight>> = {
  parse: (raw) => Number(raw),
  serialize: (value) => (value === undefined ? "" : String(value)),
}

const preference = localPreference(
  "tsukumo-next-step-tray-height:v1",
  savedHeight,
  undefined,
  pxCodec,
)

/**
 * 並びの上の仕切りを `pointerY` まで動かしたときの高さ。
 * 並びの下端は入力欄に付いて動かないので、下端から pointer までの距離から、仕切りの中心と並びの上端の間（`gripGap`）を引く。
 * 札1段より低くも、札が全部見える高さ（`contentHeight`）より高くもしない。
 */
export function nextStepTrayHeightAt(drag: {
  readonly pointerY: number
  readonly chipsBottom: number
  readonly gripGap: number
  readonly contentHeight: number
}): number {
  const height = drag.chipsBottom - drag.pointerY - drag.gripGap
  const max = Math.max(MIN_HEIGHT_PX, drag.contentHeight)
  return Math.round(Math.min(max, Math.max(MIN_HEIGHT_PX, height)))
}

/** 保存した高さ。まだ一度も動かしていない・読めないときは undefined。 */
export const loadNextStepTrayHeight = preference.load

export function saveNextStepTrayHeight(px: number): void {
  preference.save(px)
}

/** 保存した高さを捨て、CSS の既定に戻す。 */
export function resetNextStepTrayHeight(): void {
  preference.save(undefined)
}
