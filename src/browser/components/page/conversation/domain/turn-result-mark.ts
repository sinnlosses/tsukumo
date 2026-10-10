// やり取りの結果（`TurnResult`）を、やり取りの列と進み具合の帯が同じ印と字で出すための表。

import { omit } from "remeda"

import type { TurnResult } from "../../../../../shared/session/turn-result.ts"

/**
 * 帯のチップが言える状態。レポートの無いやり取りは帯が段の進みから決めるか、出さないので入らない。
 * `background` はターンが終わって背景のタスクだけが残るときで、やり取りの列の印には無い。
 */
export type WorkStripResult = Exclude<TurnResult, "no-report"> | "background"

export const TURN_RESULT_MARKS = {
  done: { mark: "✓", label: "完了" },
  "awaiting-answer": { mark: "?", label: "答え待ち" },
  stopped: { mark: "‖", label: "止めた" },
  failed: { mark: "✕", label: "失敗" },
  working: { mark: "…", label: "作業中" },
  "no-report": { mark: "–", label: "レポートなし" },
} as const satisfies Record<TurnResult, { readonly mark: string; readonly label: string }>

export const WORK_STRIP_MARKS = {
  ...omit(TURN_RESULT_MARKS, ["no-report"]),
  background: { mark: "·", label: "背景で作業中" },
} as const satisfies Record<WorkStripResult, { readonly mark: string; readonly label: string }>
