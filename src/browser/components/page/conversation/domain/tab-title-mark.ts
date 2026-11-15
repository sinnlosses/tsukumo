// タブの題の頭に付ける状態の印。最新のやり取りの結果と、ページが隠れているあいだに終わったかから決める。

import { TURN_RESULT_MARKS } from "./turn-result-mark.ts"
import type { TurnResult } from "./turn-result.ts"

/** 答え待ち（お伺いがある）の印。やり取りの結果の印「?」とは別で、前から変わらない。 */
const PENDING_MARK = "●"

/**
 * 題の頭の印（無ければ空）。上の条件が先。
 * 答え待ち → 作業中 → 失敗 → 隠れているあいだに終わった完了・止めた → なし。
 */
export function tabTitleMarkOf(input: {
  readonly pendingActive: boolean
  readonly newestResult: TurnResult
  readonly endedWhileHidden: boolean
}): string {
  if (input.pendingActive) {
    return PENDING_MARK
  }
  switch (input.newestResult) {
    case "working":
    case "failed":
      return TURN_RESULT_MARKS[input.newestResult].mark
    case "done":
    case "stopped":
      return input.endedWhileHidden ? TURN_RESULT_MARKS[input.newestResult].mark : ""
    case "awaiting-answer":
    case "no-report":
      return ""
  }
}

/**
 * 結果が変わった時点で、「隠れているあいだに終わった」かを決める。
 * 作業中か答え待ちから完了・止めたへ変わり、そのときページが隠れていたときだけ真。
 * 読み込み直後の結果（変わっていない）は真にしない。
 */
export function endedWhileHiddenOf(
  previous: TurnResult,
  next: TurnResult,
  hidden: boolean,
): boolean {
  const wasOpen = previous === "working" || previous === "awaiting-answer"
  return hidden && wasOpen && (next === "done" || next === "stopped")
}

/** 題を組む。印が空なら元の題のまま。 */
export function tabTitleOf(originalTitle: string, mark: string): string {
  return mark === "" ? originalTitle : `${mark} ${originalTitle}`
}
