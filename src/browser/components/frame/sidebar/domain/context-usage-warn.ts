// コンテキストの使用量を警告の色にするかの語彙。

import type { UseContextUsageResult } from "../../../../domain/context-usage.ts"

/** 警告にする境目（%）。見本の説明文から取った値。 */
const WARN_THRESHOLD_PERCENTAGE = 70

/** 警告の色にするか。まだ数が無いときは警告にしない。 */
export function isContextUsageWarn(usage: UseContextUsageResult): boolean {
  return usage.kind === "ready" && usage.percentage >= WARN_THRESHOLD_PERCENTAGE
}
