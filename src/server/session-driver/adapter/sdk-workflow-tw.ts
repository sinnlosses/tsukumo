// 取り込んだ tsukumo-plugins の入口 `bin/tw` の hook のサブコマンドを子として走らせる。

import { execFile } from "node:child_process"
import { join } from "node:path"

import { workflowPluginDir } from "./workflow-plugin.ts"

export const WORKFLOW_TW_TIMEOUT_MS = 5000
const MAX_OUTPUT_BYTES = 1024 * 1024

export type WorkflowTwRun = {
  readonly twPath: string
  readonly subcommand: string
  readonly stdin: string
  readonly timeoutMs: number
}

/** `stdin` を標準入力に渡して `<twPath> <subcommand>` を走らせ、標準出力を返す。失敗・タイムアウトは空文字列。 */
export function runWorkflowTw(run: WorkflowTwRun): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(
      run.twPath,
      [run.subcommand],
      { timeout: run.timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        resolve(error === null ? stdout : "")
      },
    )
    child.stdin?.on("error", () => {})
    child.stdin?.end(run.stdin)
  })
}

export function workflowTwPath(): string {
  return join(workflowPluginDir(), "bin", "tw")
}
