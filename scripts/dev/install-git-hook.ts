// 共有の .git/hooks に pre-commit を置く。何度打っても同じ結果になる。

import { join } from "node:path"
import process from "node:process"

import { readGitCommonDirectory } from "../shared/git-query.ts"
import { installPreCommitHook } from "./lib/git-hook-install.ts"

const hooksDirectory = join(readGitCommonDirectory(process.cwd()), "hooks")
const result = installPreCommitHook(hooksDirectory)

const MESSAGES = {
  installed: `pre-commit を置いた: ${hooksDirectory}/pre-commit`,
  unchanged: `pre-commit は置いてある: ${hooksDirectory}/pre-commit`,
  foreign: `別の中身の pre-commit があるので上書きしない: ${hooksDirectory}/pre-commit（ファイルの大きさの検査を入れるなら、そこから scripts/hook/pre-commit-token-limit.ts を呼ぶ）`,
} as const satisfies Record<typeof result, string>

console.log(MESSAGES[result])
