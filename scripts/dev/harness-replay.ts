// 凍結したタスクの再試集（test/harness-replay/）の件を、着手前のコミットの一時の作業ツリーで claude に実装させ、
// 判定コマンド（完了条件を見る単体テスト）の通りと、トークン・時間・拒否の回数を集計する入口。
// 実際に claude を起こすので、1件ぶんで数百万トークンを使う。一時の作業ツリーと枝は成否にかかわらず消す。
//
// 使い方:
//   pnpm run harness-replay -- --tasks <ID> --k 1 [--out <path>]

import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

import { runClaude } from "../shared/claude-run.ts"
import { readReplayCase, readReplayTaskText, type ReplayCase } from "../shared/replay-case.ts"
import type { ReplayResult } from "../shared/replay-flakiness.ts"
import { parseReplayOptions } from "../shared/replay-option.ts"
import { buildReplayPrompt, prependReplayBrief } from "../shared/replay-prompt.ts"
import { formatReplaySummary, summarizeReplay, type ReplayRun } from "../shared/replay-summary.ts"
import {
  checkoutCheckFiles,
  createReplayWorktree,
  linkDependencies,
  overlayHarness,
  removeReplayWorktree,
  sweepStaleReplayWorktrees,
  type ReplayWorktree,
} from "../shared/replay-worktree.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"

const options = parseReplayOptions(process.argv.slice(2))
if (options === "invalid") {
  process.stderr.write(
    "使い方: pnpm run harness-replay -- --tasks <ID,…> [--k <n>] [--brief <path>] [--out <path>]\n",
  )
  process.exit(2)
}

const brief = options.brief === undefined ? undefined : readBrief(options.brief)

const swept = sweepStaleReplayWorktrees(ROOT)
if (swept > 0) {
  process.stderr.write(`前回の再試の残り ${swept} 件（作業ツリーと枝）を消しました\n`)
}

const running = new Set<ReplayWorktree>()
for (const [signal, code] of [
  ["SIGTERM", 143],
  ["SIGINT", 130],
] as const) {
  process.on(signal, () => {
    for (const worktree of running) removeReplayWorktree(ROOT, worktree)
    process.exit(code)
  })
}

const cases: ReplayResult["cases"][number][] = []
for (const id of options.tasks) {
  const script = readReplayCase(ROOT, id)
  const taskText = readReplayTaskText(ROOT, id)
  const runs: ReplayRun[] = []
  for (let attempt = 0; attempt < options.k; attempt += 1) {
    runs.push(replayOnce(script, taskText))
  }
  const summary = summarizeReplay(runs)
  for (const line of formatReplaySummary(id, summary)) {
    process.stdout.write(`${line}\n`)
  }
  cases.push({ id, summary })
  // 背景の上限で止められても済んだ件を比べに使えるよう、1件ごとに書き直す。
  if (options.out !== undefined) {
    writeFileSync(
      options.out,
      `${JSON.stringify({ cases } satisfies ReplayResult, undefined, 2)}\n`,
    )
  }
}

function readBrief(path: string): string {
  try {
    return readFileSync(path, "utf8")
  } catch {
    process.stderr.write(`--brief のファイルを読めません: ${path}\n`)
    return process.exit(2)
  }
}

function replayOnce(script: ReplayCase, taskText: string): ReplayRun {
  const worktree = createReplayWorktree(ROOT, script.id, script.base)
  running.add(worktree)
  try {
    linkDependencies(ROOT, worktree)
    overlayHarness(ROOT, worktree)
    const body = buildReplayPrompt(taskText)
    const claude = runClaude(
      worktree.path,
      brief === undefined ? body : prependReplayBrief(brief, body),
    )
    checkoutCheckFiles(worktree, script.after, script.checkFiles)
    const check = spawnSync("pnpm", script.command.slice(1), {
      cwd: worktree.path,
      stdio: "ignore",
    })
    return { passed: check.status === 0, ...claude }
  } finally {
    removeReplayWorktree(ROOT, worktree)
    running.delete(worktree)
  }
}
