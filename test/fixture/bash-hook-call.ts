// Bash の hook の判定を、入力の文字列だけで確かめるテストが使う呼び出しの組み立て。

import type { BashHookCall } from "../../scripts/hook/lib/bash-hook-call.ts"

export function bashCall(command: string, overrides: Partial<BashHookCall> = {}): BashHookCall {
  return {
    command,
    cwd: undefined,
    runsInBackground: false,
    fromSubagent: false,
    ...overrides,
  }
}
