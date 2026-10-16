// サブエージェントの Bash の中で、E2E の vitest をファイルを名指さずに `pnpm run test:e2e` を経ずに起こさせない。
// globalSetup は vitest を起こしたプロセスで走るので、`process.argv` が vitest の引数になる。

import process from "node:process"

import { E2E_ENTRY_VARIABLE, findDirectE2eStartRefusal } from "../scripts/dev/lib/e2e-entry-gate.ts"
import { hasFreshSubagentMark } from "../scripts/shared/e2e-run-ledger.ts"
import { readGitDirectory } from "../scripts/shared/git-directory.ts"
import { REPOSITORY_ROOT } from "../scripts/shared/repository-root.ts"

export default function setup(): void {
  const gitDir = readGitDirectory(REPOSITORY_ROOT)
  const refusal = findDirectE2eStartRefusal({
    entryValue: process.env[E2E_ENTRY_VARIABLE],
    args: process.argv.slice(2),
    hasSubagentMark:
      gitDir !== undefined &&
      hasFreshSubagentMark(gitDir, Temporal.Now.instant().epochMilliseconds),
  })
  if (refusal !== undefined) {
    throw new Error(refusal)
  }
}
