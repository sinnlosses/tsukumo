// Bash ツールの hook の入口が共通で使う、標準入力から Bash の呼び出しを読む処理と、拒否して止める処理。

import process from "node:process"

import { type BashHookCall, parseBashHookCall } from "./bash-hook-call.ts"
import { recordHookDenial } from "./hook-denial-record.ts"

export async function readBashHookCall(): Promise<BashHookCall | undefined> {
  return parseBashHookCall(await readStdin())
}

/** 拒否を記録し、理由を stderr へ出して終了コード 2 で止める。 */
export function denyBashCall(
  call: BashHookCall,
  denial: { readonly hook: string; readonly rule: string; readonly refusal: string },
): never {
  recordHookDenial({
    hook: denial.hook,
    rule: denial.rule,
    actor: call.fromSubagent ? "subagent" : "main",
  })
  process.stderr.write(`${denial.refusal}\n`)
  process.exit(2)
}

async function readStdin(): Promise<string> {
  const chunks: string[] = []
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string)
  }
  return chunks.join("")
}
