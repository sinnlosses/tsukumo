// `pnpm run test:e2e` の入口。組み立ててから E2E を流す。
// ファイルを渡さない全件は、`TSUKUMO_E2E_FULL=1` を立てた呼び出しだけが通す。

import { spawnSync } from "node:child_process"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { E2E_FULL_VARIABLE, judgeE2eFull, shouldTypecheckBeforeE2e } from "./lib/e2e-full-guard.ts"

const args = process.argv.slice(2)
const fullValue = process.env[E2E_FULL_VARIABLE]

const judgement = judgeE2eFull(args, fullValue)
if (judgement.kind === "deny") {
  process.stderr.write(judgement.message)
  process.exit(2)
}

const build = spawnSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "inherit" })
if (build.status !== 0) {
  process.exit(build.status ?? 1)
}
if (shouldTypecheckBeforeE2e(fullValue)) {
  const typecheck = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], { cwd: ROOT, stdio: "inherit" })
  if (typecheck.status !== 0) {
    process.exit(typecheck.status ?? 1)
  }
}
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.e2e.config.ts", ...args],
  { cwd: ROOT, stdio: "inherit" },
)
process.exit(result.status ?? 1)
