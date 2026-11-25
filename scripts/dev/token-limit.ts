// 字数とトークン数の上限を見て、超えたものと期日の来た定期見直しをドラフトの課題に積む。
// 使い方: node scripts/dev/token-limit.ts [--staged]
// 既定は上限の実測を出し、積むべきドラフトを `tw new --draft` で積む（`pnpm run check` の段）。
// `--staged` はコミットにステージしたファイルの大きさだけを見て警告する（git の pre-commit が呼ぶ）。
//
// どちらも止めない。終了コードは常に 0。tw を起こせなければ積まずに理由を出す。

import { spawnSync } from "node:child_process"
import process from "node:process"
import { parseArgs } from "node:util"

import {
  BUDGET_REVIEWED_ON,
  budgetDrafts,
  formatMeasurement,
  type BudgetDraft,
} from "../shared/budget-review.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { readStagedChanges } from "../shared/token-limit-change.ts"
import { findOversizedFiles, formatTokenLimitWarning } from "../shared/token-limit.ts"
import { measureBudgets } from "./lib/budget-measure.ts"

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: { staged: { type: "boolean", default: false } },
})

if (values.staged) {
  const oversized = findOversizedFiles(readStagedChanges(process.cwd()))
  if (oversized.length > 0) process.stderr.write(`${formatTokenLimitWarning(oversized)}\n`)
} else {
  await reviewBudgets()
}

async function reviewBudgets(): Promise<void> {
  const measurements = await measureBudgets(REPOSITORY_ROOT)
  for (const measurement of measurements.filter(({ current, limit }) => current > limit)) {
    process.stdout.write(`OVER\t${formatMeasurement(measurement)}\n`)
  }
  const openSummaries = readOpenSummaries()
  if (openSummaries === "unreadable") {
    process.stdout.write("SKIPPED\ttw status を読めなかったので、ドラフトを積まない\n")
    return
  }
  const dates = { today: Temporal.Now.plainDateISO().toString(), reviewedOn: BUDGET_REVIEWED_ON }
  for (const draft of budgetDrafts(measurements, openSummaries, dates)) {
    process.stdout.write(`${fileDraft(draft) ? "DRAFTED" : "NOT_DRAFTED"}\t${draft.summary}\n`)
  }
}

/** `tw status` のタスクの行（ID・状態・…・題）から題を取る。 */
function readOpenSummaries(): readonly string[] | "unreadable" {
  const status = spawnSync("tw", ["status"], { cwd: REPOSITORY_ROOT, encoding: "utf8" })
  if (status.status !== 0) return "unreadable"
  return status.stdout
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((columns) => /^[A-Z]+-\d+$/.test(columns[0] ?? "") && columns.length >= 8)
    .map((columns) => columns[7] ?? "")
}

function fileDraft(draft: BudgetDraft): boolean {
  const result = spawnSync(
    "tw",
    [
      "new",
      "--summary",
      draft.summary,
      "--difficulty",
      "sonnet",
      "--loopable",
      "Y",
      "--draft",
      "--body-file",
      "-",
    ],
    { cwd: REPOSITORY_ROOT, encoding: "utf8", input: draft.body },
  )
  return result.status === 0
}
