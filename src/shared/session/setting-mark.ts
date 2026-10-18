// 設定の点（`SettingMark`）を、切り替えを受け付けたとき・効いているのを見届けたときに付け替える畳み込み。

import type { SettingConfirmation } from "./session-event.ts"
import type { SessionState } from "./session-state.ts"

type SettingName = SettingConfirmation["setting"]

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

/**
 * 切り替えを受け付けた印を付ける（見届ける前の印は新しい値と時刻で付け直し、`from` は最初の切り替えの前の値を引き継ぐ）。
 * 見届ける前に `from` へ戻したときは印を消す（戻したことが点の有無で分かる）。
 * `running` になる前は付けない（起こした直後の `effort-changed` で、起動のたびに点が出てしまう）。
 */
export function withAcceptedMark(
  state: SessionState,
  setting: SettingName,
  value: string,
  origin: SettingOrigin,
  at: number,
): SessionState {
  if (state.session.kind !== "running") {
    return state
  }
  const current = state.settingMarks[setting]
  const from = current.kind === "accepted" ? current.from : origin
  const reverted = from.kind === "known" && sameSettingValue(setting, from.value, value)
  return {
    ...state,
    settingMarks: {
      ...state.settingMarks,
      [setting]: reverted ? NO_SETTING_MARK : { kind: "accepted", value, at, from },
    },
  }
}

export function originOf(value: string | undefined): SettingOrigin {
  return value === undefined ? { kind: "unknown" } : { kind: "known", value }
}

export function withConfirmedMark(
  state: SessionState,
  confirmation: SettingConfirmation,
  at: number,
): SessionState {
  const mark = state.settingMarks[confirmation.setting]
  return mark.kind === "accepted" && settingValueMatches(confirmation, mark.value)
    ? {
        ...state,
        settingMarks: {
          ...state.settingMarks,
          [confirmation.setting]: { kind: "confirmed", value: mark.value, at },
        },
      }
    : state
}

function settingValueMatches(confirmation: SettingConfirmation, accepted: string): boolean {
  return sameSettingValue(confirmation.setting, confirmation.value, accepted)
}

/** モデルだけ、`sonnet` のような別名がフルネームに含まれていれば同じ値とみなす。 */
function sameSettingValue(setting: SettingName, left: string, right: string): boolean {
  return left === right || (setting === "model" && (left.includes(right) || right.includes(left)))
}
