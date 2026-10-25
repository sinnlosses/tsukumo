// 凍結した再演集（test/harness-replay/）の件を、着手前のコミットの一時の作業ツリーで claude に実装させ、
// 台本（完了条件を見る単体テスト）の通りと、トークン・時間・拒否の回数を集計する入口。
// 実際に claude を起こすので、1件ぶんで数百万トークンを使う。一時の作業ツリーと枝は成否にかかわらず消す。
//
// 使い方:
//   pnpm run harness-replay -- --tasks <ID> --k 1

import { spawnSync } from "node:child_process"
import process from "node:process"

import { runClaude } from "../shared/claude-run.ts"
import { parseReplayOptions } from "../shared/replay-option.ts"
import { buildReplayPrompt } from "../shared/replay-prompt.ts"
import { readReplayScript, readReplayTaskText, type ReplayScript } from "../shared/replay-script.ts"
import { formatReplaySummary, summarizeReplay, type ReplayRun } from "../shared/replay-summary.ts"
import {
  checkoutCheckFiles,
  createReplayWorktree,
  linkDependencies,
  overlayHarness,
  removeReplayWorktree,
} from "../shared/replay-worktree.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"

const options = parseReplayOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write("使い方: pnpm run harness-replay -- --tasks <ID,…> [--k <n>]\n")
  process.exit(2)
}

for (const id of options.tasks) {
  const script = readReplayScript(ROOT, id)
  const taskText = readReplayTaskText(ROOT, id)
  const runs: ReplayRun[] = []
  for (let attempt = 0; attempt < options.k; attempt += 1) {
    runs.push(replayOnce(script, taskText))
  }
  for (const line of formatReplaySummary(id, summarizeReplay(runs))) {
    process.stdout.write(`${line}\n`)
  }
}

function replayOnce(script: ReplayScript, taskText: string): ReplayRun {
  const worktree = createReplayWorktree(ROOT, script.id, script.base)
  try {
    linkDependencies(ROOT, worktree)
    overlayHarness(ROOT, worktree)
    const claude = runClaude(worktree.path, buildReplayPrompt(taskText))
    checkoutCheckFiles(worktree, script.after, script.checkFiles)
    const check = spawnSync("pnpm", script.command.slice(1), {
      cwd: worktree.path,
      stdio: "ignore",
    })
    return { passed: check.status === 0, ...claude }
  } finally {
    removeReplayWorktree(ROOT, worktree)
  }
}
