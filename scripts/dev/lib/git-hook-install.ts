// 共有の git の hooks ディレクトリに、ファイルの大きさを検査する pre-commit を置く。

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type PreCommitInstallResult = "installed" | "unchanged" | "foreign"

const PRE_COMMIT_SCRIPT = `#!/bin/sh
root=$(git rev-parse --show-toplevel) || exit 0
[ -f "$root/scripts/hook/pre-commit-token-limit.ts" ] || exit 0
exec node "$root/scripts/hook/pre-commit-token-limit.ts"
`

/** 別の中身の pre-commit が既にあれば書き換えず `foreign` を返す。 */
export function installPreCommitHook(hooksDirectory: string): PreCommitInstallResult {
  const hookPath = join(hooksDirectory, "pre-commit")
  if (existsSync(hookPath)) {
    return readFileSync(hookPath, "utf8") === PRE_COMMIT_SCRIPT ? "unchanged" : "foreign"
  }
  mkdirSync(hooksDirectory, { recursive: true })
  writeFileSync(hookPath, PRE_COMMIT_SCRIPT)
  chmodSync(hookPath, 0o755)
  return "installed"
}
