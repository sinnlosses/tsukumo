// 渡された `tw` の hook のサブコマンドを子として走らせる。どの `tw` かは呼ぶ側が決める。

import { execFile } from "node:child_process"

export const WORKFLOW_TW_TIMEOUT_MS = 5000
const MAX_OUTPUT_BYTES = 1024 * 1024

export type WorkflowTwRun = {
  readonly twPath: string
  readonly subcommand: string
  readonly stdin: string
  readonly timeoutMs: number
}

/** `runWorkflowTw` の結果。`failed` は 0 以外で終わった・信号で止まった・出力が上限を超えた。 */
export type WorkflowTwResult =
  | { readonly kind: "ok"; readonly stdout: string }
  | { readonly kind: "failed" | "timed-out" | "not-started" }

/** `stdin` を標準入力に渡して `<twPath> <subcommand>` を走らせ、成功なら標準出力を、失敗は種類を返す。 */
export function runWorkflowTw(run: WorkflowTwRun): Promise<WorkflowTwResult> {
  return new Promise((resolve) => {
    const child = execFile(
      run.twPath,
      [run.subcommand],
      { timeout: run.timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        resolve(error === null ? { kind: "ok", stdout } : { kind: failureKind(error) })
      },
    )
    child.stdin?.on("error", () => {})
    child.stdin?.end(run.stdin)
  })
}

function failureKind(error: Error): "failed" | "timed-out" | "not-started" {
  const code: unknown = Reflect.get(error, "code")
  if (typeof code === "number" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "failed"
  }
  if (Reflect.get(error, "killed") === true) {
    return "timed-out"
  }
  const syscall: unknown = Reflect.get(error, "syscall")
  return typeof syscall === "string" && syscall.startsWith("spawn") ? "not-started" : "failed"
}
