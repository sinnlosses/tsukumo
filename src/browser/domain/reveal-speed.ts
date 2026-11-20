// レポートを「書き上げていくように見せる」演出の速さの、画面に出すラベルと具体の ms 値（`POP_INTERVAL_MS`）。
//
// `off` は間隔を持たない。
// 「切る」は演出そのものを走らせない選択で、`useReportReveal` が `revealSpeed === "off"` を見て `startPop` を呼ばずに済ませる（本文はすぐ全部出て、ミニ立ち絵も出ない）。

import { REVEAL_SPEEDS, type RevealSpeed } from "../../shared/session/gear-preference.ts"

/** `<select>` に出す順とラベル。 */
export const REVEAL_SPEED_LABELS = [
  ["standard", "標準"],
  ["fast", "速い"],
  ["off", "切る"],
] satisfies readonly (readonly [RevealSpeed, string])[]

/** 塊を1つポンと出してから次の塊を出すまでの間隔（ms）。`fast` は `standard` の半分。 */
const POP_INTERVAL_MS = {
  standard: 240,
  fast: 120,
} satisfies Readonly<Record<Exclude<RevealSpeed, "off">, number>>

/** `off` は間隔を持たないので受け取らない。 */
export function popIntervalOf(speed: Exclude<RevealSpeed, "off">): number {
  return POP_INTERVAL_MS[speed]
}

export function isRevealSpeed(value: string): value is RevealSpeed {
  return REVEAL_SPEEDS.some((speed) => speed === value)
}
