// `tw verify` を打つコマンドか。`nice`・`timeout`・`env`・`pnpm exec`・`bash -c` 越しも数える。

import { baseName, parseShellCommand } from "./shell-command.ts"

/** `verify-check`・`verify-plan` 等の別サブコマンドは数えない。 */
export function runsTwVerify(bashCommand: string): boolean {
  return parseShellCommand(bashCommand).some((simple) => {
    const [name, subcommand] = simple.argv
    return name !== undefined && baseName(name.text) === "tw" && subcommand?.text === "verify"
  })
}
