// `pnpm run test` の入口。ファイルで絞ったときも規約のテスト（`CONVENTION_TEST_PATHS`）を一緒に走らせる。
// 先頭が `--related` なら、続くファイルを import するテストに絞る（`vitest related`）。

import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { RELATED_FLAG } from "./lib/check-stage.ts"
import {
  ARCHITECTURE_TEST_DIRECTORY,
  withConventionTests,
  withRelatedConventionTests,
} from "./lib/convention-test.ts"

const args = process.argv.slice(2).filter(isNotSeparator)
const vitestArgs =
  args[0] === RELATED_FLAG
    ? ["related", "--run", ...withRelatedConventionTests(args.slice(1), listArchitectureTests())]
    : ["run", ...withConventionTests(args)]
const result = spawnSync("pnpm", ["exec", "vitest", ...vitestArgs], { cwd: ROOT, stdio: "inherit" })
process.exit(result.status ?? 1)

function listArchitectureTests(): readonly string[] {
  return readdirSync(join(ROOT, ARCHITECTURE_TEST_DIRECTORY))
    .filter((name) => name.endsWith(".test.ts"))
    .toSorted()
    .map((name) => `${ARCHITECTURE_TEST_DIRECTORY}${name}`)
}

/** `pnpm run test -- <ファイル>` の `--` は、残すと vitest が絞り込みとして読まない。 */
function isNotSeparator(arg: string): boolean {
  return arg !== "--"
}
