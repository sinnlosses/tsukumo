// サブエージェントの Bash が走っている間だけ、E2E の回数の台帳が見る印を置き・消す。
// PreToolUse で `tool_use_id` の印を置き、PostToolUse・PostToolUseFailure で消す。
// `run_in_background` の呼び出しは PostToolUse が背景に回った時点で来るので消さず、印の失効に任せる。
// 主のセッションの呼び出し（`agent_id` が無い）には何もしない。印を置けなくても Bash の実行は変えない。

import process from "node:process"

import { placeSubagentMark, removeSubagentMark } from "../../shared/e2e-run-ledger.ts"
import { readGitDirectory } from "../../shared/git-directory.ts"
import type { BashHookCall } from "./bash-hook-call.ts"

export function handleSubagentMark(call: BashHookCall): void {
  try {
    if (!call.fromSubagent || call.toolUseId === undefined) {
      return
    }
    const gitDir = readGitDirectory(process.env["CLAUDE_PROJECT_DIR"] ?? call.cwd ?? process.cwd())
    if (gitDir === undefined) {
      return
    }
    if (call.event === "PreToolUse") {
      placeSubagentMark(gitDir, call.toolUseId)
    } else if (
      call.event === "PostToolUseFailure" ||
      (call.event === "PostToolUse" && !call.runsInBackground)
    ) {
      removeSubagentMark(gitDir, call.toolUseId)
    }
  } catch {
    // 印が残らなくても Bash の実行は変えない
  }
}
