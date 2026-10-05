// 入力を与えない `cat` を見つける。標準入力が端末のままだと、入力を待って止まる。

import { parseShellCommand } from "./shell-command.ts"

export function hasStdinWaitingCat(command: string): boolean {
  return parseShellCommand(command).some(
    (simple) =>
      simple.argv[0]?.text === "cat" &&
      simple.argv.slice(1).every((word) => word.text.startsWith("-")) &&
      simple.inputs.length === 0 &&
      simple.stdinTexts.length === 0 &&
      !simple.pipedIn,
  )
}
