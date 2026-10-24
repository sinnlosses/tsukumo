// `tw verify` を打つコマンドか。`nice`・`timeout`・`env`・`pnpm exec`・`bash -c` 越しも数える。

import type { BashDenial } from "./bash-denial.ts"
import type { BashHookCall } from "./bash-hook-call.ts"
import { baseName, parseShellCommand } from "./shell-command.ts"

const REFUSAL = `\`tw verify\`（検査の全段。3〜4分）は背景で打たない。背景で打つと完了通知で手番が
終わり、検査が走っていないのに待ちで止まる。

前景で、Bash の \`timeout\` 引数（最大 600000）を付けて打つこと:

  tw verify   # timeout: 600000`

/** 委譲先が `tw verify` を背景で打つ呼び出しなら拒否を返す。メインの呼び出しは対象にしない。 */
export function findBackgroundVerifyDenial(call: BashHookCall): BashDenial | undefined {
  const denied = call.fromSubagent && call.runsInBackground && runsTwVerify(call.command)
  return denied
    ? { hook: "deny-background-verify", rule: "background-verify", refusal: REFUSAL }
    : undefined
}

/** `verify-check`・`verify-plan` 等の別サブコマンドは数えない。 */
function runsTwVerify(bashCommand: string): boolean {
  return parseShellCommand(bashCommand).some((simple) => {
    const [name, subcommand] = simple.argv
    return name !== undefined && baseName(name.text) === "tw" && subcommand?.text === "verify"
  })
}
