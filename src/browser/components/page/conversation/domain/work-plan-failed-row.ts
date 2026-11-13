// 失敗で閉じたやり取りの計画で、止まった段の行に印を付ける。

import { rowsOfSlot, type WorkPlanRow, type WorkPlanSlot } from "./work-plan-row.ts"

/**
 * 読み順で最初の今の段（`current`）の行を `failed` にした並びを返す。今の段が無ければそのまま返す。
 * 失敗で閉じたやり取りにだけ使う。
 */
export function markFailedRow(slots: readonly WorkPlanSlot[]): readonly WorkPlanSlot[] {
  const failedKey = slots.flatMap(rowsOfSlot).find((row) => row.state === "current")?.key
  if (failedKey === undefined) {
    return slots
  }
  const mark = (row: WorkPlanRow): WorkPlanRow =>
    row.key === failedKey ? { ...row, state: "failed" } : row
  return slots.map((slot) =>
    slot.kind === "phase"
      ? { ...slot, row: mark(slot.row) }
      : { ...slot, rows: slot.rows.map(mark) },
  )
}
