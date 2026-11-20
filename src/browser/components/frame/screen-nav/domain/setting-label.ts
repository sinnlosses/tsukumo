// 設定の `<select>` に出す値とラベルの表のうち、複数の場所（行の選択肢・「既定に戻す」の title）が読むもの。

import type { FigurePreference } from "../../../../../shared/session/session-default.ts"

/** 図の既定の `<select>` に出す順とラベル。 */
export const FIGURE_PREFERENCE_LABELS = [
  ["chart", "図を置く"],
  ["text", "文を主にする"],
] as const satisfies readonly (readonly [FigurePreference, string])[]

/** 待ちの一言の間の `<select>` に出す順とラベル。 */
export const WAITING_LINE_LABELS = [
  ["1m", "1分"],
  ["2m", "2分"],
  ["5m", "5分"],
  ["off", "出さない"],
] as const satisfies readonly (readonly [string, string])[]

/** 進み具合の催促の黙りの間の `<select>` に出す順とラベル。 */
export const PROGRESS_NUDGE_LABELS = [
  ["3m", "3分"],
  ["5m", "5分"],
  ["10m", "10分"],
  ["off", "しない"],
] as const satisfies readonly (readonly [string, string])[]

/** 値とラベルの表からラベルを引く。無ければ値をそのまま返す。 */
export function labelOfValue(table: readonly (readonly [string, string])[], value: string): string {
  return table.find(([candidate]) => candidate === value)?.[1] ?? value
}
