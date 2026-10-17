// 設定の点（`SettingMark`）を、切り替えを受け付けたとき・効いているのを見届けたときに付け替える畳み込み。

import type { SettingConfirmation } from "./session-event.ts"
import type { SessionState, SettingMark, SettingOrigin } from "./session-state.ts"

type SettingName = SettingConfirmation["setting"]

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
