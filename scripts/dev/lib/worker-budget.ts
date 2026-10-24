// 同時に走る検証の間で、vitest の worker の予算を分け合う。
// 予算は、1本だけのときの単体と E2E の worker の合計（設定の `maxWorkers: "40%"` を2つ並べた数）。

const STAGE_COUNT = 2
const SHARE_OF_CORES = 0.4

/** 検証全体の worker の予算。`override` が正の整数なら、それを使う。 */
export function workerBudget(cores: number, override: string | undefined): number {
  const given = Number(override)
  if (override !== undefined && Number.isInteger(given) && given > 0) {
    return given
  }
  return STAGE_COUNT * Math.max(1, Math.round(cores * SHARE_OF_CORES))
}

/** 走っている検証が `running` 本のとき、単体と E2E の段それぞれに配る worker の数（最小 1）。 */
export function workersPerStage(budget: number, running: number): number {
  return Math.max(1, Math.floor(budget / Math.max(1, running) / STAGE_COUNT))
}
