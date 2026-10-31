// `pnpm run test` の入口。ファイルで絞ったときも規約のテスト（`CONVENTION_TEST_PATHS`）を一緒に走らせる。
// 先頭が `--related` なら、続くファイルを import するテストに絞る（`vitest related`）。

import { spawnSync } from "node:child_process"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import {
  RELATED_FLAG,
  WITHOUT_UNUSED_EXPORT_ENV,
  WITHOUT_UNUSED_EXPORT_FLAG,
} from "./lib/check-stage.ts"
import {
  listConventionTests,
  withConventionTests,
  withRelatedConventionTests,
} from "./lib/convention-test.ts"

const args = process.argv.slice(2).filter(isNotSeparator)
const withoutUnusedExport = args.includes(WITHOUT_UNUSED_EXPORT_FLAG)
const vitestArgs =
  args[0] === RELATED_FLAG
    ? [
        "related",
        "--run",
        ...withRelatedConventionTests(
          args.slice(1).filter((arg) => arg !== WITHOUT_UNUSED_EXPORT_FLAG),
          listConventionTests(ROOT),
        ),
      ]
    : ["run", ...withConventionTests(args)]
const result = spawnSync("pnpm", ["exec", "vitest", ...vitestArgs], {
  cwd: ROOT,
  stdio: "inherit",
  env: withoutUnusedExport ? { ...process.env, [WITHOUT_UNUSED_EXPORT_ENV]: "1" } : process.env,
})
process.exit(result.status ?? 1)

/** `pnpm run test -- <ファイル>` の `--` は、残すと vitest が絞り込みとして読まない。 */
function isNotSeparator(arg: string): boolean {
  return arg !== "--"
}
