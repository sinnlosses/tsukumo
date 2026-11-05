// レポートを「書き上げていくように見せる」演出の速さを `localStorage` に持つ。
// 読めない・欠けている値は既定（`standard`）へ畳む。
//
// 具体の ms 値（`POP_INTERVAL_MS`）もここに置く。
//
// `off` は間隔を持たない。
// 「切る」は演出そのものを走らせない選択で、`useReportReveal` が `revealSpeed === "off"` を見て `startPop` を呼ばずに済ませる（本文はすぐ全部出て、ミニ立ち絵も出ない）。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../utils/local-preference.ts"

export type RevealSpeed = "standard" | "fast" | "off"

const DEFAULT_REVEAL_SPEED: RevealSpeed = "standard"

/** `<select>` に出す順とラベル。 */
export const REVEAL_SPEED_LABELS = [
  ["standard", "標準"],
  ["fast", "速い"],
  ["off", "切る"],
] satisfies readonly (readonly [RevealSpeed, string])[]

const preference = localPreference(
  "tsukumo-reveal-speed:v1",
  z.custom<RevealSpeed>((value) => typeof value === "string" && isRevealSpeed(value)),
  DEFAULT_REVEAL_SPEED,
  RAW_STRING_CODEC,
)

/** 塊を1つポンと出してから次の塊を出すまでの間隔（ms）。`fast` は `standard` の半分。 */
const POP_INTERVAL_MS = {
  standard: 240,
  fast: 120,
} satisfies Readonly<Record<Exclude<RevealSpeed, "off">, number>>

/** `off` は間隔を持たないので受け取らない。 */
export function popIntervalOf(speed: Exclude<RevealSpeed, "off">): number {
  return POP_INTERVAL_MS[speed]
}

export const loadRevealSpeed: () => RevealSpeed = preference.load

export const saveRevealSpeed: (value: RevealSpeed) => void = preference.save

export function isRevealSpeed(value: string): value is RevealSpeed {
  return REVEAL_SPEED_LABELS.some(([speed]) => speed === value)
}
