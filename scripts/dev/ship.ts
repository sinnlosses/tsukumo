// タスクに紐付かない作業を main へ送る入口。着手中のタスクが無いか（あれば拒む）→ 作業ツリーが clean か → main を出している作業ツリーが
// clean か → 受け入れ（`src/`・`scripts/`・`test/` を触る差分なら受け入れ役を起こす）→ `git rebase main` → `pnpm run check --full` → `git merge --ff-only` の順に動く。
//
// 使い方:
//   node scripts/dev/ship.ts [--criteria-file <パス>]

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
import { isWorktreeClean, resolveMainWorktreePath, syncSubmodules } from "./lib/main-worktree.ts"
import { runShipPlan, type ShipPlanResult } from "./lib/ship-plan.ts"
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

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { "criteria-file": { type: "string" } },
  strict: true,
})
const criteriaText = readCriteriaFile(values["criteria-file"])

const primaryBranch = PRIMARY_BRANCH
const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim()
const mainWorktreePath = resolveMainWorktreePath(ROOT, primaryBranch)

if (mainWorktreePath === ROOT || branch === primaryBranch) {
  process.stdout.write(`${primaryBranch} 自身の作業ツリーなので送る対象が無い\n`)
  process.exit(0)
}

const result = runShipPlan({
  hasOpenClaim: () => hasOpenClaimInWorktree(),
  isOwnWorktreeClean: () => isWorktreeClean(ROOT),
  isMainWorktreeClean: () => isWorktreeClean(mainWorktreePath),
  review: () => reviewBeforeShip(),
  rebaseOntoMain: () => {
    try {
      execFileSync("git", ["rebase", primaryBranch], { cwd: ROOT, stdio: "inherit" })
      return "ok"
    } catch {
      execFileSync("git", ["rebase", "--abort"], { cwd: ROOT, stdio: "inherit" })
      return "conflict"
    }
  },
  verify: () =>
    spawnSync("pnpm", ["run", "check", "--full"], { cwd: ROOT, stdio: "inherit" }).status ?? 1,
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
})

if (result.outcome !== "ok") {
  process.stderr.write(`${describeFailure(result)}\n`)
  process.exitCode = 1
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

function reviewBeforeShip(): ShipReviewOutcome {
  const base = mergeBaseWithPrimary()
  const outcome = reviewDiff({
    changedPaths: () => collectChangedPaths(ROOT, primaryBranch),
    diffPatchId: () => patchIdOf(gitOutput(["diff", base, "HEAD"]), base),
    firstCommitPatchId: () => {
      const first =
        gitOutput(["rev-list", "--reverse", `${primaryBranch}..HEAD`]).split("\n")[0] ?? ""
      return first === "" ? base : patchIdOf(gitOutput(["show", first]), first)
    },
    marks: createShipReviewMarks(
      path.join(readGitCommonDirectory(ROOT), REVIEW_MARK_DIRECTORY_NAME),
      Temporal.Now.instant().epochMilliseconds,
    ),
    runAcceptor: () => {
      process.stdout.write("受け入れ役を起こして差分の判定を待つ（数分かかる）\n")
      const agents = parseAgentDefinition(readFileSync(ACCEPTOR_DEFINITION_PATH, "utf8"))
      return runAcceptor(
        ROOT,
        buildAcceptorPrompt(base, acceptorCriteria()),
        JSON.stringify(agents),
        ACCEPTOR_VERDICT_JSON_SCHEMA,
      )
    },
  })
  if (outcome.kind === "passed") {
    process.stdout.write("REVIEW_PASSED\n")
  } else if (outcome.kind === "skipped") {
    process.stdout.write("REVIEW_SKIPPED\tdocs-only\n")
  }
  return outcome
}

function acceptorCriteria(): AcceptorCriteria {
  if (criteriaText !== undefined) {
    return { kind: "file", text: criteriaText }
  }
  const subjects = gitOutput(["log", "--format=%s", `${primaryBranch}..HEAD`])
    .split("\n")
    .filter((subject) => subject !== "")
  return { kind: "subjects", subjects }
}

function mergeBaseWithPrimary(): string {
  const base = queryGit(ROOT, ["merge-base", "HEAD", primaryBranch])?.trim()
  if (base === undefined || base === "") {
    throw new Error(`${primaryBranch} とのマージベースが見つからない`)
  }
  return base
}

function gitOutput(args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
}

function patchIdOf(patch: string, fallback: string): string {
  const id = execFileSync("git", ["patch-id", "--stable"], {
    cwd: ROOT,
    encoding: "utf8",
    input: patch,
  })
    .trim()
    .split(" ")[0]
  return id === undefined || id === "" ? fallback : id
}

function hasOpenClaimInWorktree(): boolean {
  const status = spawnSync("tw", ["status", "--claims"], { cwd: ROOT, encoding: "utf8" })
  const reading = status.status === 0 ? readOpenClaim(status.stdout) : "unreadable"
  if (reading === "unreadable") {
    process.stderr.write(
      "tw status --claims を読めなかったので、着手中のタスクの確かめを飛ばして進める\n",
    )
  }
  return reading === "claimed"
}

function describeFailure(failure: Exclude<ShipPlanResult, { outcome: "ok" }>): string {
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
