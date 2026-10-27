// `claude -p` を1回起こす、という概念1つを持つ。
// `claude` を起こすのはこのファイルだけ。環境変数は今のセッションの目印を落として引き継ぐ。
import { spawnSync } from "node:child_process"
import process from "node:process"

import { replayEnvironment } from "./claude-environment.ts"
import {
  parseClaudeResult,
  parseClaudeStructuredResult,
  type ClaudeRunResult,
} from "./claude-result.ts"

const CLAUDE_TIMEOUT_MS = 30 * 60 * 1000
const ACCEPTOR_TIMEOUT_MS = 20 * 60 * 1000
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024
const ACCEPTOR_AGENT_NAME = "acceptor"

const ACCEPTOR_ALLOWED_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
]

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

/**
 * `cwd` で、`agentsJson`（`claude --agents` の形）が定める受け入れ役に `prompt` を1回渡し、
 * `outputSchema`（JSON Schema の文字列）に合わせた構造化出力を返す。形の検証は呼ぶ側がする。
 * 起こせない・上限を超えた・エラーで終わったときは例外を投げる。
 */
export function runAcceptor(
  cwd: string,
  prompt: string,
  agentsJson: string,
  outputSchema: string,
): unknown {
  const spawned = spawnSync(
    "claude",
    [
      "-p",
      prompt,
      "--agents",
      agentsJson,
      "--agent",
      ACCEPTOR_AGENT_NAME,
      "--output-format",
      "json",
      "--json-schema",
      outputSchema,
      "--allowedTools",
      ...ACCEPTOR_ALLOWED_TOOLS,
    ],
    {
      cwd,
      encoding: "utf8",
      env: replayEnvironment(process.env),
      timeout: ACCEPTOR_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    },
  )
  if (spawned.error !== undefined) {
    throw spawned.error
  }
  const result = parseClaudeStructuredResult(spawned.stdout)
  if (result.isError) {
    throw new Error("受け入れ役の claude -p がエラーで終わった")
  }
  return result.output
}
