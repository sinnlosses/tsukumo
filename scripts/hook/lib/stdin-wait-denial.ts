// 入力を与えない `cat` を見つける。標準入力が端末のままだと、入力を待って止まる。

import type { BashDenial } from "./bash-denial.ts"
import type { BashHookCall } from "./bash-hook-call.ts"
import { parseShellCommand } from "./shell-command.ts"

const REFUSAL = `入力を与えない \`cat\`（\`cat\`・\`cat > /dev/null\` など）は、標準入力を待って止まる。
中身の無い \`cat\` は書かない。ファイルを読むなら Read ツールか \`cat <file>\`、パイプで受けるなら \`cmd | cat\`、heredoc を渡すなら \`cat <<'EOF'\` で入力を与える。`

/** 入力を与えない `cat` なら拒否を返す。 */
export function findStdinWaitCatDenial(call: BashHookCall): BashDenial | undefined {
  return hasStdinWaitingCat(call.command)
    ? { hook: "deny-stdin-wait-cat", rule: "stdin-wait-cat", refusal: REFUSAL }
    : undefined
}

function hasStdinWaitingCat(command: string): boolean {
  return parseShellCommand(command).some(
    (simple) =>
      simple.argv[0]?.text === "cat" &&
      simple.argv.slice(1).every((word) => word.text.startsWith("-")) &&
      simple.inputs.length === 0 &&
      simple.stdinTexts.length === 0 &&
      !simple.pipedIn,
  )
}
