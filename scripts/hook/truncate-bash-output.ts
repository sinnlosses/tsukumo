// Bash ツールの PostToolUse で走り、結果が既定の行数を超えた呼び出しを log-only で記録する入口
// （`.claude/settings.json` から Bash ツールに掛かる）。
//
// PostToolUse は組み込みの Bash の結果を差し替えられないので、ここでは切らない。
// 終了コードと出力はいつも空のまま返し、記録の失敗でも Bash の結果を変えない。

import { findBashOutputOverflow } from "./lib/bash-output-overflow.ts"
import { recordHookDenial } from "./lib/hook-denial-record.ts"
import { readBashHookResult } from "./lib/hook-input.ts"

const result = await readBashHookResult()
const overflow =
  result === undefined ? undefined : findBashOutputOverflow(result.call, result.output)
if (result !== undefined && overflow !== undefined) {
  recordHookDenial({
    ...overflow,
    actor: result.call.fromSubagent ? "subagent" : "main",
    mode: "log-only",
  })
}
