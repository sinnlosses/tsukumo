// タスクに紐付かない作業を main へ送る入口。着手中のタスクが無いか（あれば拒む）→ 作業ツリーが clean か → main を出している作業ツリーが
// clean か → 受け入れ（`src/`・`scripts/`・`test/` を触る差分なら受け入れ役を起こす）→ `git rebase main` → `pnpm run check --full` → `git merge --ff-only` の順に動く。
// `--enqueue` は受け入れまでを済ませて送り出しの列に積んで戻り、`--drain` は列の先頭から1件ずつ取り込み・検証・送り出しを打つ。
// `--drain` は錠で作業ツリーをまたいで1つだけ走り、受け入れ役は起こさず `--enqueue` が残した受け入れの印だけを見る。
//
// 使い方:
//   node scripts/dev/ship.ts [--criteria-file <パス>]
//   node scripts/dev/ship.ts --enqueue [--criteria-file <パス>]
//   node scripts/dev/ship.ts --drain

import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"

import { collectChangedPaths, PRIMARY_BRANCH } from "../shared/changed-path-repository.ts"
import { runAcceptor } from "../shared/claude-run.ts"
import { queryGit, readGitCommonDirectory } from "../shared/git-query.ts"
import { readOpenClaim } from "../shared/open-claim.ts"
import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { isProcessAlive } from "./lib/check-running.ts"
import {
  isWorktreeClean,
  resolveWorktreePathOfBranch,
  syncSubmodules,
} from "./lib/main-worktree.ts"
import { runShipPlan, type ShipPlanHooks, type ShipPlanResult } from "./lib/ship-plan.ts"
import {
  createShipQueue,
  drainShipQueue,
  enqueueAfterReview,
  tryAcquireDrainLock,
  verifyWithRetry,
  type EnqueueResult,
  type ShippedEntry,
  type ShipQueueRecord,
  type VerifyVerdict,
} from "./lib/ship-queue.ts"
import {
  ACCEPTOR_VERDICT_JSON_SCHEMA,
  buildAcceptorPrompt,
  createShipReviewMarks,
  parseAgentDefinition,
  reviewDiff,
  type AcceptorCriteria,
  type ShipReviewOutcome,
} from "./lib/ship-review.ts"

const ROOT = path.resolve(REPOSITORY_ROOT)
const ACCEPTOR_DEFINITION_PATH = path.join(ROOT, "vendor/tsukumo-plugins/agents/acceptor.md")
const REVIEW_MARK_DIRECTORY_NAME = "ship-review"
const QUEUE_DIRECTORY_NAME = "ship-queue"
const NO_ACCEPTED_MARK = "受け入れの印が無い。--enqueue で受け入れを通してから積む"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "criteria-file": { type: "string" },
    enqueue: { type: "boolean", default: false },
    drain: { type: "boolean", default: false },
  },
  strict: true,
})
if (values.drain && (values.enqueue || values["criteria-file"] !== undefined)) {
  process.stderr.write("--drain は --enqueue・--criteria-file と一緒に使えない\n")
  process.exit(1)
}
const criteriaText = readCriteriaFile(values["criteria-file"])

const primaryBranch = PRIMARY_BRANCH
const commonDirectory = readGitCommonDirectory(ROOT)
const queue = createShipQueue(
  path.join(commonDirectory, QUEUE_DIRECTORY_NAME),
  () => Temporal.Now.instant().epochMilliseconds,
)
const mainWorktreePath = resolveWorktreePathOfBranch(ROOT, primaryBranch)

if (values.drain) {
  drain()
} else {
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim()
  if (mainWorktreePath === ROOT || branch === primaryBranch) {
    process.stdout.write(`${primaryBranch} 自身の作業ツリーなので送る対象が無い\n`)
    process.exit(0)
  }
  if (values.enqueue) {
    enqueue(branch)
  } else {
    const result = runShipPlan(
      shipPlanHooks(
        ROOT,
        branch,
        () => reviewBeforeShip(ROOT, () => runAcceptorAt(ROOT)),
        () => verifyOnce(ROOT),
      ),
    )
    if (result.outcome !== "ok") {
      process.stderr.write(`${describeFailure(result)}\n`)
      process.exitCode = 1
    }
  }
}

function enqueue(branch: string): void {
  const result: EnqueueResult = enqueueAfterReview({
    hasOpenClaim: () => hasOpenClaimInWorktree(ROOT),
    isOwnWorktreeClean: () => isWorktreeClean(ROOT),
    review: () => reviewBeforeShip(ROOT, () => runAcceptorAt(ROOT)),
    enqueue: () => queue.enqueue(branch),
  })
  switch (result.outcome) {
    case "queued":
      process.stdout.write(
        `QUEUED\t${branch}\t送るには node scripts/dev/ship.ts --drain を打つ（別の drain が走っていればそちらが拾う）\n`,
      )
      return
    case "already-queued":
      process.stdout.write(`ALREADY_QUEUED\t${branch}\n`)
      return
    default:
      process.stderr.write(`${describeFailure(result)}\n`)
      process.exitCode = 1
  }
}

function drain(): void {
  const result = drainShipQueue(
    queue,
    () =>
      tryAcquireDrainLock(
        path.join(commonDirectory, QUEUE_DIRECTORY_NAME),
        process.pid,
        isProcessAlive,
      ),
    (branch) => shipQueuedBranch(branch),
    () => Temporal.Now.instant().toString(),
  )
  if (result.kind === "running") {
    process.stdout.write(`DRAIN_RUNNING\t${String(result.owner)}\n`)
    return
  }
  for (const record of result.shipped) {
    process.stdout.write(`${describeShipped(record)}\n`)
  }
  process.stdout.write("DRAINED\n")
  if (result.shipped.some((record) => record.outcome !== "ok")) {
    process.exitCode = 1
  }
}

function shipQueuedBranch(branch: string): ShippedEntry {
  let worktree: string
  try {
    worktree = resolveWorktreePathOfBranch(ROOT, branch)
  } catch (error) {
    return {
      outcome: "worktree-missing",
      reason: error instanceof Error ? error.message : String(error),
      verify: "not-run",
    }
  }
  let verify: VerifyVerdict = "not-run"
  const result = runShipPlan(
    shipPlanHooks(
      worktree,
      branch,
      () =>
        reviewBeforeShip(worktree, () => {
          throw new Error(NO_ACCEPTED_MARK)
        }),
      () => {
        const checked = verifyWithRetry(() => verifyOnce(worktree))
        verify = verify === "flaky" && checked.verdict === "passed" ? "flaky" : checked.verdict
        return checked.status
      },
    ),
  )
  return {
    outcome: result.outcome,
    reason: result.outcome === "ok" ? "" : describeFailure(result),
    verify,
  }
}

function shipPlanHooks(
  worktree: string,
  branch: string,
  review: () => ShipReviewOutcome,
  verify: () => number,
): ShipPlanHooks {
  return {
    hasOpenClaim: () => hasOpenClaimInWorktree(worktree),
    isOwnWorktreeClean: () => isWorktreeClean(worktree),
    isMainWorktreeClean: () => isWorktreeClean(mainWorktreePath),
    review,
    rebaseOntoMain: () => {
      try {
        execFileSync("git", ["rebase", primaryBranch], { cwd: worktree, stdio: "inherit" })
        return "ok"
      } catch {
        execFileSync("git", ["rebase", "--abort"], { cwd: worktree, stdio: "inherit" })
        return "conflict"
      }
    },
    verify,
    mergeFfOnly: () => {
      try {
        execFileSync("git", ["merge", "--ff-only", branch], {
          cwd: mainWorktreePath,
          stdio: "inherit",
        })
        return "ok"
      } catch {
        return "not-fast-forward"
      }
    },
    syncSubmodules: () => {
      syncSubmodules(mainWorktreePath)
    },
  }
}

function verifyOnce(worktree: string): number {
  return (
    spawnSync("pnpm", ["run", "check", "--full"], { cwd: worktree, stdio: "inherit" }).status ?? 1
  )
}

function readCriteriaFile(criteriaPath: string | undefined): string | undefined {
  if (criteriaPath === undefined) {
    return undefined
  }
  try {
    return readFileSync(criteriaPath, "utf8")
  } catch {
    process.stderr.write(`--criteria-file ${criteriaPath} を読めなかった\n`)
    process.exit(1)
  }
}

function reviewBeforeShip(worktree: string, runReviewer: () => unknown): ShipReviewOutcome {
  const base = mergeBaseWithPrimary(worktree)
  const outcome = reviewDiff({
    changedPaths: () => collectChangedPaths(worktree, primaryBranch),
    diffPatchId: () => patchIdOf(worktree, gitOutput(worktree, ["diff", base, "HEAD"]), base),
    firstCommitPatchId: () => {
      const first =
        gitOutput(worktree, ["rev-list", "--reverse", `${primaryBranch}..HEAD`]).split("\n")[0] ??
        ""
      return first === "" ? base : patchIdOf(worktree, gitOutput(worktree, ["show", first]), first)
    },
    marks: createShipReviewMarks(
      path.join(commonDirectory, REVIEW_MARK_DIRECTORY_NAME),
      Temporal.Now.instant().epochMilliseconds,
    ),
    runAcceptor: runReviewer,
  })
  if (outcome.kind === "passed") {
    process.stdout.write("REVIEW_PASSED\n")
  } else if (outcome.kind === "skipped") {
    process.stdout.write("REVIEW_SKIPPED\tdocs-only\n")
  }
  return outcome
}

function runAcceptorAt(worktree: string): unknown {
  process.stdout.write("受け入れ役を起こして差分の判定を待つ（数分かかる）\n")
  const agents = parseAgentDefinition(readFileSync(ACCEPTOR_DEFINITION_PATH, "utf8"))
  return runAcceptor(
    worktree,
    buildAcceptorPrompt(mergeBaseWithPrimary(worktree), acceptorCriteria(worktree)),
    JSON.stringify(agents),
    ACCEPTOR_VERDICT_JSON_SCHEMA,
  )
}

function acceptorCriteria(worktree: string): AcceptorCriteria {
  if (criteriaText !== undefined) {
    return { kind: "file", text: criteriaText }
  }
  const subjects = gitOutput(worktree, ["log", "--format=%s", `${primaryBranch}..HEAD`])
    .split("\n")
    .filter((subject) => subject !== "")
  return { kind: "subjects", subjects }
}

function mergeBaseWithPrimary(worktree: string): string {
  const base = queryGit(worktree, ["merge-base", "HEAD", primaryBranch])?.trim()
  if (base === undefined || base === "") {
    throw new Error(`${primaryBranch} とのマージベースが見つからない`)
  }
  return base
}

function gitOutput(worktree: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: worktree,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
}

function patchIdOf(worktree: string, patch: string, fallback: string): string {
  const id = execFileSync("git", ["patch-id", "--stable"], {
    cwd: worktree,
    encoding: "utf8",
    input: patch,
  })
    .trim()
    .split(" ")[0]
  return id === undefined || id === "" ? fallback : id
}

function hasOpenClaimInWorktree(worktree: string): boolean {
  const status = spawnSync("tw", ["status", "--claims"], { cwd: worktree, encoding: "utf8" })
  const reading = status.status === 0 ? readOpenClaim(status.stdout) : "unreadable"
  if (reading === "unreadable") {
    process.stderr.write(
      "tw status --claims を読めなかったので、着手中のタスクの確かめを飛ばして進める\n",
    )
  }
  return reading === "claimed"
}

function describeShipped(record: ShipQueueRecord): string {
  if (record.outcome === "ok") {
    return record.verify === "flaky"
      ? `SHIPPED\t${record.branch}\tflaky`
      : `SHIPPED\t${record.branch}`
  }
  return `SHIP_FAILED\t${record.branch}\t${record.outcome}\t${record.reason.split("\n")[0] ?? ""}`
}

function describeFailure(
  failure:
    | Exclude<ShipPlanResult, { outcome: "ok" }>
    | Exclude<EnqueueResult, { outcome: "queued" | "already-queued" }>,
): string {
  switch (failure.outcome) {
    case "task-claimed":
      return "この作業ツリーに着手中のタスクがある。tw finish で送る"
    case "own-worktree-dirty":
      return "自分の作業ツリーに未コミットの変更がある"
    case "main-worktree-dirty":
      return `${primaryBranch} を出している作業ツリーに未コミットの変更がある`
    case "review-rejected":
      return [
        "REVIEW_REJECTED\t受け入れ役が差し戻した。直してコミットし、打ち直す（差し戻しはあと0回）",
        ...failure.findings.map((finding) => `- ${finding}`),
      ].join("\n")
    case "review-exhausted":
      return [
        "REVIEW_EXHAUSTED\t差し戻しのあとも受け入れ役が通さなかった。打ち直さず人に報告する",
        ...failure.findings.map((finding) => `- ${finding}`),
      ].join("\n")
    case "review-unavailable":
      return `REVIEW_UNAVAILABLE\t受け入れ役の判定が取れなかった: ${failure.reason}`
    case "rebase-conflict":
      return `git rebase ${primaryBranch} が衝突した（rebase --abort 済み）`
    case "verify-failed":
      return `pnpm run check --full が終了コード ${String(failure.status)} で落ちた`
    case "merge-ff-only-exhausted":
      return `git merge --ff-only がやり直し${String(failure.attempts)}回でも通らなかった`
  }
}
