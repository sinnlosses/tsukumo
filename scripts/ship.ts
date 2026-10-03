// タスクに紐付かない作業を main へ送る入口。作業ツリーが clean か → main を出している作業ツリーが
// clean か → `git rebase main` → `pnpm run check` → `git merge --ff-only` の順に動く。
//
// 使い方:
//   node scripts/ship.ts

import { execFileSync, spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { resolvePrimaryBranch } from "./lib/changed-path-repository.ts"
import { isWorktreeClean, resolveMainWorktreePath } from "./lib/main-worktree.ts"
import { runShipPlan, type ShipPlanResult } from "./lib/ship-plan.ts"

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)))

const primaryBranch = await resolvePrimaryBranch(ROOT)
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
  isOwnWorktreeClean: () => isWorktreeClean(ROOT),
  isMainWorktreeClean: () => isWorktreeClean(mainWorktreePath),
  rebaseOntoMain: () => {
    try {
      execFileSync("git", ["rebase", primaryBranch], { cwd: ROOT, stdio: "inherit" })
      return "ok"
    } catch {
      execFileSync("git", ["rebase", "--abort"], { cwd: ROOT, stdio: "inherit" })
      return "conflict"
    }
  },
  verify: () => spawnSync("pnpm", ["run", "check"], { cwd: ROOT, stdio: "inherit" }).status ?? 1,
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
})

if (result.outcome !== "ok") {
  process.stderr.write(`${describeFailure(result)}\n`)
  process.exitCode = 1
}

function describeFailure(failure: Exclude<ShipPlanResult, { outcome: "ok" }>): string {
  switch (failure.outcome) {
    case "own-worktree-dirty":
      return "自分の作業ツリーに未コミットの変更がある"
    case "main-worktree-dirty":
      return `${primaryBranch} を出している作業ツリーに未コミットの変更がある`
    case "rebase-conflict":
      return `git rebase ${primaryBranch} が衝突した（rebase --abort 済み）`
    case "verify-failed":
      return `pnpm run check が終了コード ${String(failure.status)} で落ちた`
    case "merge-ff-only-exhausted":
      return `git merge --ff-only がやり直し${String(failure.attempts)}回でも通らなかった`
  }
}
