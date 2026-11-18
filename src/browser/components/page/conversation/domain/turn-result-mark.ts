// やり取りの結果（`TurnResult`）を、やり取りの列が出す印と字の表。

import type { TurnResult } from "./turn-result.ts"

/**
 * 進み具合のプログレスバーの状態の印が言える状態。レポートの無いやり取りは帯が段の進みから決めるか、出さないので入らない。
 * `background` はターンが終わってバックグラウンドタスクだけが残るときで、やり取りの列の印には無い。
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
