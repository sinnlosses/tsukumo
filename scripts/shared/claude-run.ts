// `claude -p` を一時の作業ツリーで1回起こす、という概念1つを持つ。
// `claude` を起こすのはこのファイルだけ。環境変数は今のセッションの目印を落として引き継ぐ。
import { spawnSync } from "node:child_process"
import process from "node:process"

import { replayEnvironment } from "./claude-environment.ts"
import { parseClaudeResult, type ClaudeRunResult } from "./claude-result.ts"

const CLAUDE_TIMEOUT_MS = 30 * 60 * 1000
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024

const ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(pnpm:*)",
  "Bash(node:*)",
  "Bash(git:*)",
]

/** 一時の作業ツリー `cwd` で、`prompt` を1回走らせる。 */
export function runClaude(cwd: string, prompt: string): ClaudeRunResult {
  const spawned = spawnSync(
    "claude",
    [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      ...ALLOWED_TOOLS,
    ],
    {
      cwd,
      encoding: "utf8",
      env: replayEnvironment(process.env),
      timeout: CLAUDE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    },
  )
  if (spawned.error !== undefined) {
    throw spawned.error
  }
  return parseClaudeResult(spawned.stdout)
}
