// 道具・設定・MCP を持たない素の `claude -p` を書き手として起こし、題材を並行して書かせる口。

import { execFile } from "node:child_process"
import process from "node:process"

import { replayEnvironment } from "../../shared/claude-environment.ts"

export type Writer = { readonly model: string; readonly effort: string | undefined }

const CLAUDE_TIMEOUT_MS = 600_000
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** system prompt と依頼の文を1回渡し、返答の全文を返す。 */
export function askPlainClaude(writer: Writer, system: string, user: string): Promise<string> {
  const effortArgs = writer.effort === undefined ? [] : ["--effort", writer.effort]
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      [
        "-p",
        "--model",
        writer.model,
        ...effortArgs,
        "--tools",
        "",
        "--disable-slash-commands",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--system-prompt",
        system,
        user,
      ],
      {
        env: replayEnvironment(process.env),
        timeout: CLAUDE_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error)
        } else {
          resolve(stdout)
        }
      },
    )
    child.stdin?.end()
  })
}

/**
 * 項目を `concurrency` 本の並びで順に `work` へ渡す。1件でも投げたら、残りを始めずに止める。
 * 戻り値は止めた項目の id と理由で、全部済んだら空の文字列。
 */
export async function runWriterPool<T extends { readonly id: string }>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<string> {
  const queue = [...items]
  let failure = ""
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined && failure === ""; next = queue.shift()) {
      try {
        await work(next)
      } catch (error) {
        failure = `${next.id}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return failure
}
