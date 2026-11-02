// Bash の結果が既定の行数を超えたかと、超えたコマンドを PreToolUse で包み直せる形かを決める。
// 包み直せる形かは規則のキーにして記録に残し、block に上げる前の再生の材料にする。

import type { BashHookCall } from "./bash-hook-call.ts"
import { parseShellCommand } from "./shell-command.ts"

const BASH_OUTPUT_LINE_LIMIT = 200

/** `wrappable` 以外は、コマンドを包み直すと動きが変わる形。 */
type WrapShape = "wrappable" | "heredoc" | "background"

export type BashOutputOverflow = {
  readonly hook: "truncate-bash-output"
  readonly rule: WrapShape
  readonly cutLines: number
}

/** 結果が既定の行数を超えていれば、切ったであろう行数と包み直せる形かを返す。 */
export function findBashOutputOverflow(
  call: BashHookCall,
  output: string,
): BashOutputOverflow | undefined {
  const cutLines = countLines(output) - BASH_OUTPUT_LINE_LIMIT
  return cutLines > 0
    ? { hook: "truncate-bash-output", rule: wrapShape(call), cutLines }
    : undefined
}

function countLines(output: string): number {
  const body = output.endsWith("\n") ? output.slice(0, -1) : output
  return body === "" ? 0 : body.split("\n").length
}

function wrapShape(call: BashHookCall): WrapShape {
  if (call.runsInBackground) {
    return "background"
  }
  return parseShellCommand(call.command).some((simple) => simple.stdinTexts.length > 0)
    ? "heredoc"
    : "wrappable"
}
