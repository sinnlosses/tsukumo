// 再演1件ぶんの結果（k 回）を、pass^k と中央値に集計する、という概念1つを持つ。外に触らない。

/** 再演の1回の結果。 */
export type ReplayRun = {
  readonly passed: boolean
  readonly tokens: number
  readonly durationMs: number
  readonly denials: number
}

export type ReplaySummary = {
  /** k 回とも台本が通った。 */
  readonly passAll: boolean
  readonly runs: number
  readonly passedRuns: number
  readonly medianTokens: number
  readonly medianDurationMs: number
  readonly totalDenials: number
}

export function summarizeReplay(runs: readonly ReplayRun[]): ReplaySummary {
  const passedRuns = runs.filter((run) => run.passed).length
  return {
    passAll: runs.length > 0 && passedRuns === runs.length,
    runs: runs.length,
    passedRuns,
    medianTokens: median(runs.map((run) => run.tokens)),
    medianDurationMs: median(runs.map((run) => run.durationMs)),
    totalDenials: runs.reduce((sum, run) => sum + run.denials, 0),
  }
}

/** 1件ぶんの出力。pass^k・トークンの中央値・時間の中央値・拒否の回数を1行ずつ。 */
export function formatReplaySummary(id: string, summary: ReplaySummary): readonly string[] {
  return [
    `${id} pass^${String(summary.runs)}: ${summary.passAll ? "通った" : "通らなかった"}（${String(summary.passedRuns)}/${String(summary.runs)}）`,
    `${id} トークンの中央値: ${String(Math.round(summary.medianTokens))}`,
    `${id} 時間の中央値: ${String(Math.round(summary.medianDurationMs / 1000))}秒`,
    `${id} 拒否の回数: ${String(summary.totalDenials)}`,
  ]
}

/** 中央値。偶数個のときは中央の2つの平均。空は 0。 */
function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle] ?? 0
  if (sorted.length % 2 === 1) {
    return upper
  }
  return ((sorted[middle - 1] ?? 0) + upper) / 2
}
