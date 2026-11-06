// 設定の点（`SettingMark`）の型と、値から元を作る読み書き。

import type { SettingConfirmation } from "./session-event-setting.ts"

export type SettingName = SettingConfirmation["setting"]

/**
 * 設定の点の元。`at` は印を付けた時刻で、同じ値の付け直しを別の印として区別する。
 * - `none`: 点なし
 * - `accepted`: 切り替えを受け付けた（空洞の点）。見届けるまで残る。`from` は切り替える前に効いていた値
 * - `confirmed`: 受け付けた値で効いているのを見届けた（塗りの点）
 */
export type SettingMark =
  | { readonly kind: "none" }
  | {
      readonly kind: "accepted"
      readonly value: string
      readonly at: number
      readonly from: SettingOrigin
    }
  | { readonly kind: "confirmed"; readonly value: string; readonly at: number }

/** 切り替える前に効いていた値。まだ分かっていなければ `unknown`。 */
export type SettingOrigin =
  | { readonly kind: "known"; readonly value: string }
  | { readonly kind: "unknown" }

export type SettingMarks = Readonly<Record<SettingName, SettingMark>>

export const NO_SETTING_MARK = { kind: "none" } satisfies SettingMark

export function originOf(value?: string): SettingOrigin {
  return value === undefined ? { kind: "unknown" } : { kind: "known", value }
}
