// テストが使う、手で書いた架空の利用枠（`docs/glossary.md`「利用枠」）。コンテキストの内訳の
// 架空フィクスチャと同じ形で、既定を1つ持ち、呼ぶ側は違うところだけを渡す。

import type { PlanUsage, PlanUsageReport } from "../../src/shared/plan-usage/plan-usage.ts"

/** 架空の利用枠1つ。違うところだけを渡す。 */
export function planUsage(overrides: Partial<PlanUsage> = {}): PlanUsage {
  return {
    fiveHour: { utilization: 34, resetsAt: 1_800_010_800_000 },
    sevenDay: { utilization: 61, resetsAt: 1_800_270_000_000 },
    ...overrides,
  }
}

/** 取れたときの結果（中身は {@link planUsage}）。 */
export function readyPlanUsage(overrides: Partial<PlanUsage> = {}): PlanUsageReport {
  return { kind: "ready", usage: planUsage(overrides) }
}
