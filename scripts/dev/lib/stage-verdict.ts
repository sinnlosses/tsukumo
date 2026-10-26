// `pnpm run check` の出力の最後に出す `STAGE<TAB><段名><TAB><値>` の4値を、段の結果から決める。
// 書式は `vendor/tsukumo-plugins/check.sh` の `emit_stages` と同じ。

export type StageVerdict = "pass" | "fail" | "unobserved" | "blocked"

/** 走った段の結果。`selectedTestCount` は JSON レポートを読めた段の選ばれたテストの数で、読めない・書かない段は `undefined`。 */
export type RanStage = {
  readonly name: string
  readonly status: number
  readonly stopped: boolean
  readonly lockTimedOut: boolean
  readonly selectedTestCount: number | undefined
}

/** E2E の入口が回数の上限で止まるときの終了コード。 */
const E2E_LIMIT_EXIT_CODE = 2

export function ranStageVerdict(stage: RanStage): StageVerdict {
  if (stage.stopped) {
    return "unobserved"
  }
  if (stage.lockTimedOut || (stage.name === "test:e2e" && stage.status === E2E_LIMIT_EXIT_CODE)) {
    return "blocked"
  }
  if (stage.status !== 0) {
    return "fail"
  }
  return stage.selectedTestCount === 0 ? "unobserved" : "pass"
}

export type NamedVerdict = { readonly name: string; readonly verdict: StageVerdict }

/**
 * `universe`（全段の名前の並び）の順に、計画に入った段はその値、計画で落とした段は `unobserved` にする。
 * `universe` に無い計画の段（文書の検査など）は、計画の順で後ろに足す。
 */
export function withDroppedStages(
  universe: readonly string[],
  planned: readonly NamedVerdict[],
): readonly NamedVerdict[] {
  const inUniverse = universe.map(
    (name): NamedVerdict =>
      planned.find((stage) => stage.name === name) ?? { name, verdict: "unobserved" },
  )
  return [...inUniverse, ...planned.filter((stage) => !universe.includes(stage.name))]
}

/** 段の順に1段1行の `STAGE` 行にする。 */
export function formatStageLines(stages: readonly NamedVerdict[]): readonly string[] {
  return stages.map((stage) => `STAGE\t${stage.name}\t${stage.verdict}`)
}

/**
 * vitest の JSON レポーターの出力から、選ばれたテストの総数（`numTotalTests`）を読む。
 * 読めない・形が違う JSON は `undefined`。
 */
export function parseSelectedTestCount(json: string): number | undefined {
  try {
    const report: unknown = JSON.parse(json)
    if (typeof report !== "object" || report === null || !("numTotalTests" in report)) {
      return undefined
    }
    return typeof report.numTotalTests === "number" ? report.numTotalTests : undefined
  } catch {
    return undefined
  }
}
