// `pnpm run check` の入口。`test:e2e` は変えたファイルから選んだ E2E のファイルだけを流し
// （選び方は `selectE2eFiles`）、何を選んだかを1行で出す。`docs/`・`develop/` の Markdown しか
// 変えていないときは `typecheck`・`lint` も省く。`format:check` と単体テスト
// （タスク番号や節の参照の検査が文書を見ている）は省かない。
// 重い段（`test`・`test:e2e`）は作業ツリーをまたぐ錠を取って、単体と E2E を並べて走らせる。
// 並べた2段の出力は段ごとに溜め、両方が終わってから段の順に出し、落ちた段は最後の行で名指しする。
//
// 変えたファイルが `develop/direction.md`・`develop/draft/`・`docs/history/` だけ（タスク登録だけ）の
// ときは、`--full` の有無に関わらず `format:check` と文書の検査（`DOCUMENT_CHECK_TEST_FILES`）だけを打つ。
//
// 使い方:
//   node scripts/check.ts         # 変えたファイルを見て、E2E を選び、文書だけなら typecheck・lint も省く
//   node scripts/check.ts --full  # タスク登録だけの変更でなければ、5段すべてを、E2E は全件で走らせる
//                                 # （変えたファイルを集められないときも5段すべて）

import { spawn, spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { collectChangedPaths, resolvePrimaryBranch } from "./lib/changed-path-repository.ts"
import { describeFailedStages, type StageOutcome } from "./lib/check-failure.ts"
import { acquireCheckLock, withCheckLockOwner } from "./lib/check-lock-repository.ts"
import { planStages, type Stage } from "./lib/check-stage.ts"
import { planE2eRun } from "./lib/e2e-selection-repository.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const forceFull = process.argv.includes("--full")

const changedPaths = await collectPathsForPlan()
const stagePlan = planStages(forceFull, changedPaths, chooseE2eStages)
if (stagePlan.notice !== "") {
  process.stdout.write(`${stagePlan.notice}\n`)
}
const activeStages = stagePlan.stages

for (const stage of activeStages.filter((candidate) => !candidate.heavy)) {
  const result = spawnSync("pnpm", ["run", stage.name, ...stage.args], {
    cwd: ROOT,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const heavyStages = activeStages.filter((stage) => stage.heavy)
const release = await acquireCheckLock(ROOT)
const onSignal = (signal: NodeJS.Signals): void => {
  release()
  process.kill(process.pid, signal)
}
process.once("SIGINT", onSignal)
process.once("SIGTERM", onSignal)
try {
  const results = await Promise.all(heavyStages.map((stage) => runBuffered(stage)))
  for (const result of results) {
    process.stdout.write(result.output)
  }
  for (const line of describeFailedStages(results)) {
    process.stdout.write(`${line}\n`)
  }
  const failed = results.find((result) => result.status !== 0)
  if (failed !== undefined) {
    process.exitCode = failed.status
  }
} finally {
  release()
}

/** 変えたファイル。`--full` で集められないときは空（5段すべてを打つ）。 */
async function collectPathsForPlan(): Promise<readonly string[]> {
  try {
    return collectChangedPaths(ROOT, await resolvePrimaryBranch(ROOT))
  } catch (error) {
    if (forceFull) {
      return []
    }
    throw error
  }
}

/** `test:e2e` の段（流すものが無ければ空の列）。選んだ結果の1行を出す。 */
function chooseE2eStages(): readonly Stage[] {
  const plan = planE2eRun(ROOT, changedPaths, forceFull)
  process.stdout.write(`${plan.line}\n`)
  return plan.kind === "none" ? [] : [{ name: "test:e2e", args: plan.args, heavy: true }]
}

type BufferedResult = StageOutcome & { readonly output: string }

function runBuffered(stage: Stage): Promise<BufferedResult> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", stage.name, ...stage.args], {
      cwd: ROOT,
      env: withCheckLockOwner(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    })
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("close", (code) => {
      resolve({
        name: stage.name,
        status: code ?? 1,
        output: Buffer.concat(chunks).toString("utf8"),
      })
    })
  })
}
