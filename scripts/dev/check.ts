// `pnpm run check` の入口。`test:e2e` は変えたファイルから選んだ E2E のファイルだけを流し
// （選び方は `selectE2eFiles`）、何を選んだかを1行で出す。
// 重い段（`test`・`test:e2e`）は、軽い段のあとに単体と E2E を並べて走らせる。
// 並べた2段の出力は段ごとに溜め、両方が終わってから段の順に出し、落ちた段は最後の行で名指しする。
//
// 変えたファイルが `docs/`・`.tw/` の Markdown と直下の `README.md`・`CLAUDE.md` だけのときは、
// `--full` の有無に関わらず `format:check` と文書の検査（`DOCUMENT_CHECK_TEST_FILES`）だけを打つ。
//
// 段を組む前に、submodule が記録の版とずれていれば `git submodule update --init` で揃える。
//
// 使い方:
//   node scripts/dev/check.ts         # 変えたファイルを見て、E2E を選び、文書だけなら文書の検査だけにする
//   node scripts/dev/check.ts --full  # 文書だけの変更でなければ、5段すべてを、E2E は全件で走らせる
//                                 # （変えたファイルを集められないときも5段すべて）

import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { collectChangedPaths, PRIMARY_BRANCH } from "../shared/changed-path-repository.ts"
import { planE2eRun } from "../shared/e2e-selection-repository.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import {
  describeFailedStages,
  parseFailedTests,
  shouldStopRunningStages,
  type StageOutcome,
} from "./lib/check-failure.ts"
import { e2eStage, planStages, type Stage } from "./lib/check-stage.ts"
import { E2E_FULL_ENVIRONMENT } from "./lib/e2e-full-guard.ts"
import {
  acquireLock,
  LockWaitTimeoutError,
  REAL_LOCK_ENVIRONMENT,
  sharedLockPath,
} from "./lib/e2e-full-lock.ts"
import { findPriorityTool, stageCommand } from "./lib/stage-priority.ts"
import { alignSubmodules } from "./lib/submodule-drift.ts"

const CHECK_USAGE = `使い方:
  node scripts/dev/check.ts         # 変えたファイルから選んだ E2E だけ
  node scripts/dev/check.ts --full  # 5段すべて、E2E は全件
`

const forceFull = readForceFull(process.argv.slice(2))
const priorityTool = findPriorityTool(process.env.PATH ?? "")

alignSubmodulesOrExit()

const changedPaths = await collectPathsForPlan()
const stagePlan = planStages(changedPaths, chooseE2eStages)
if (stagePlan.notice !== "") {
  process.stdout.write(`${stagePlan.notice}\n`)
}
const activeStages = stagePlan.stages

for (const stage of activeStages.filter((candidate) => !candidate.heavy)) {
  const { command, args } = stageCommand(stage.name, stage.args, priorityTool)
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const heavyStages = activeStages.filter((stage) => stage.heavy)
if (heavyStages.length > 0) {
  await runConcurrently(heavyStages)
}

/** 走らせている段。`stop` は自分が起こした子の pid だけに `SIGTERM` を送る。 */
type RunningStage = {
  readonly result: Promise<BufferedResult>
  readonly stop: () => void
}

async function runConcurrently(stages: readonly Stage[]): Promise<void> {
  const running = stages.map((stage) => startStage(stage))
  const finished: BufferedResult[] = []
  const results = await Promise.all(
    running.map(async (run) => {
      const result = await run.result
      finished.push(result)
      if (shouldStopRunningStages(finished)) {
        for (const other of running) {
          other.stop()
        }
      }
      return result
    }),
  )
  for (const result of results) {
    process.stdout.write(result.output)
  }
  for (const line of describeFailedStages(results)) {
    process.stdout.write(`${line}\n`)
  }
  const failed = results.find((result) => result.status !== 0 && !result.stopped)
  if (failed !== undefined) {
    process.exitCode = failed.status
  }
}

function startStage(stage: Stage): RunningStage {
  const control = createStopControl()
  return { result: runLockedIfFullE2e(stage, control), stop: control.stop }
}

type StopControl = {
  readonly stop: () => void
  readonly isStopRequested: () => boolean
  /** 起こした子を渡す。止める依頼がすでにあれば、その場で止める。 */
  readonly attach: (child: ChildProcess) => void
}

function createStopControl(): StopControl {
  let stopRequested = false
  let running: ChildProcess | undefined
  return {
    stop: () => {
      stopRequested = true
      if (running !== undefined && running.exitCode === null) {
        running.kill("SIGTERM")
      }
    },
    isStopRequested: () => stopRequested,
    attach: (child) => {
      running = child
      if (stopRequested) {
        child.kill("SIGTERM")
      }
    },
  }
}

/** `--full` の E2E の段だけ、ほかの作業ツリーの全件と重ならないよう錠を取って走らせる。 */
async function runLockedIfFullE2e(stage: Stage, control: StopControl): Promise<BufferedResult> {
  if (!forceFull || stage.name !== "test:e2e") {
    return runBuffered(stage, control)
  }
  let release: () => void
  try {
    release = await acquireLock(sharedLockPath(ROOT), REAL_LOCK_ENVIRONMENT)
  } catch (error) {
    if (!(error instanceof LockWaitTimeoutError)) {
      throw error
    }
    return {
      name: stage.name,
      status: 1,
      failedTests: [],
      stopped: false,
      output: `${error.message}\n`,
    }
  }
  try {
    return await runBuffered(stage, control)
  } finally {
    release()
  }
}

/** submodule のずれを記録の版へ揃えて1行出す。揃えられなければ理由と直し方を出して止める。 */
function alignSubmodulesOrExit(): void {
  const alignment = alignSubmodules(ROOT)
  if (alignment.kind === "aligned") {
    for (const move of alignment.moves) {
      process.stdout.write(`submodule のずれを揃えた: ${move.path} ${move.from} → ${move.to}\n`)
    }
  } else if (alignment.kind === "blocked") {
    process.stderr.write(`${alignment.reason}\n直し方: git submodule update --init\n`)
    process.exit(1)
  }
}

/** `--full` の有無を読む。知らない引数は使い方を出して終了コード 2 で止まる（`--` は区切りなので捨てる）。 */
function readForceFull(args: readonly string[]): boolean {
  try {
    const { values } = parseArgs({
      args: args.filter((arg) => arg !== "--"),
      strict: true,
      options: { full: { type: "boolean" } },
    })
    return values.full === true
  } catch {
    process.stderr.write(CHECK_USAGE)
    return process.exit(2)
  }
}

/** 変えたファイル。`--full` で集められないときは空（5段すべてを打つ）。 */
async function collectPathsForPlan(): Promise<readonly string[]> {
  try {
    return collectChangedPaths(ROOT, PRIMARY_BRANCH)
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
  return plan.kind === "none" ? [] : [e2eStage(plan.args)]
}

/** 段が書いた JSON レポートを読んで消す。無ければ空。 */
function readFailedTests(reportPath: string): readonly string[] {
  try {
    return parseFailedTests(readFileSync(reportPath, "utf8"), ROOT)
  } catch {
    return []
  } finally {
    rmSync(reportPath, { force: true })
  }
}

type BufferedResult = StageOutcome & { readonly output: string }

function runBuffered(stage: Stage, control: StopControl): Promise<BufferedResult> {
  if (control.isStopRequested()) {
    return Promise.resolve({
      name: stage.name,
      status: 1,
      failedTests: [],
      stopped: true,
      output: "",
    })
  }
  const reportPath = join(
    tmpdir(),
    `tsukumo-check-${process.pid}-${stage.name.replace(":", "-")}.json`,
  )
  const reporterArgs = ["--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`]
  return new Promise((resolve) => {
    const { command, args } = stageCommand(
      stage.name,
      [...stage.args, ...reporterArgs],
      priorityTool,
    )
    const child = spawn(command, args, {
      cwd: ROOT,
      env: stage.name === "test:e2e" ? { ...process.env, ...E2E_FULL_ENVIRONMENT } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    control.attach(child)
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("close", (code) => {
      const status = code ?? 1
      resolve({
        name: stage.name,
        status,
        stopped: status !== 0 && control.isStopRequested(),
        failedTests: readFailedTests(reportPath),
        output: Buffer.concat(chunks).toString("utf8"),
      })
    })
  })
}
