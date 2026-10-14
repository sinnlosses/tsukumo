// `pnpm run test` の入口。ファイルで絞ったときも規約のテスト（`CONVENTION_TEST_PATHS`）を一緒に走らせる。

import { spawnSync } from "node:child_process"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { withConventionTests } from "./lib/convention-test.ts"

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", ...withConventionTests(process.argv.slice(2).filter(isNotSeparator))],
  { cwd: ROOT, stdio: "inherit" },
)
process.exit(result.status ?? 1)

/** `pnpm run test -- <ファイル>` の `--` は、残すと vitest が絞り込みとして読まない。 */
function isNotSeparator(arg: string): boolean {
  return arg !== "--"
}
