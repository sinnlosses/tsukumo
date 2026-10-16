// `pnpm run test:e2e` の入口。組み立ててから E2E を流す。
// ファイルを渡さない全件は、`TSUKUMO_E2E_FULL=1` を立てた呼び出しだけが通す。
// `TSUKUMO_E2E_FULL=1` の呼び出しは E2E の回数の台帳に1回足し、上限を超えたら止める。

import { spawnSync } from "node:child_process"
import process from "node:process"

import { recordHookDenial } from "../hook/lib/hook-denial-record.ts"
import { type E2eRunRecord, recordE2eRun, RUN_LIMIT } from "../shared/e2e-run-ledger.ts"
import { readGitDirectory } from "../shared/git-directory.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { E2E_ENTRY_ENVIRONMENT } from "./lib/e2e-entry-gate.ts"
import { E2E_FULL_VARIABLE, judgeE2eFull, shouldTypecheckBeforeE2e } from "./lib/e2e-full-guard.ts"

const RUN_LIMIT_REFUSAL = `E2E を全部流す呼び出し（\`tw verify\`・\`pnpm run check\`・\`pnpm run test:e2e\`）が、
着手中の1件の上限（${RUN_LIMIT}回）に達した。これ以上は打たない。

E2E のファイル単位の実行は数えないので打ってよい:

  pnpm run test:e2e test/e2e/<ファイル>.test.ts
`

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
// 組み立てに落ちた呼び出しを数えないよう、台帳には組み立てのあとで足す。
if (fullValue === "1" && recordRun() === "over-limit") {
  recordHookDenial({ hook: "e2e-run-limit", rule: "run-limit", actor: "subagent" })
  process.stderr.write(RUN_LIMIT_REFUSAL)
  process.exit(2)
}
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.e2e.config.ts", ...args],
  {
    cwd: ROOT,
    env: { ...process.env, ...E2E_ENTRY_ENVIRONMENT },
    stdio: "inherit",
  },
)
process.exit(result.status ?? 1)

function recordRun(): E2eRunRecord {
  const gitDir = readGitDirectory(ROOT)
  if (gitDir === undefined) {
    return "uncounted"
  }
  return recordE2eRun({ workRoot: ROOT, gitDir }, Temporal.Now.instant().epochMilliseconds)
}
