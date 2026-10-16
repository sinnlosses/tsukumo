// サブエージェントの Bash が走っている間だけ、E2E の回数の台帳が見る印を置く
// Claude Code の hook（`.claude/settings.json` から Bash ツールの PreToolUse・PostToolUse・PostToolUseFailure に掛かる）。
// PreToolUse で `tool_use_id` の印を置き、PostToolUse・PostToolUseFailure で消す。
// `run_in_background` の呼び出しは PostToolUse が背景に回った時点で来るので消さず、印の失効に任せる。
// 主のセッションの呼び出し（`agent_id` が無い）には何もしない。
//
// Bash の実行は止めない。印を置けなくても終了コード 0 で通す。

import process from "node:process"

import { placeSubagentMark, removeSubagentMark } from "../shared/e2e-run-ledger.ts"
import { readGitDirectory } from "../shared/git-directory.ts"
import { readBashHookCall } from "./lib/hook-input.ts"

try {
  const call = await readBashHookCall()
  if (call?.fromSubagent === true && call.toolUseId !== undefined) {
    const gitDir = readGitDir(call.cwd)
    if (gitDir !== undefined) {
      if (call.event === "PreToolUse") {
        placeSubagentMark(gitDir, call.toolUseId)
      } else if (
        call.event === "PostToolUseFailure" ||
        (call.event === "PostToolUse" && !call.runsInBackground)
      ) {
        removeSubagentMark(gitDir, call.toolUseId)
      }
    }
  }
} catch {
  // 印が残らなくても Bash の実行は変えない
}

function readGitDir(cwd: string | undefined): string | undefined {
  return readGitDirectory(process.env["CLAUDE_PROJECT_DIR"] ?? cwd ?? process.cwd())
}
