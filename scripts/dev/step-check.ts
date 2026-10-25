// `tw step` の段の検査（`.tw/config.toml` の `step_check`）。
// token-limit・typecheck・lint と、変えたコードのファイルに関連する単体を順に打ち、落ちた段で止まる。

import { spawnSync } from "node:child_process"
import process from "node:process"

import { collectChangedPaths, PRIMARY_BRANCH } from "../shared/changed-path-repository.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { planStepCheck } from "./lib/step-check-plan.ts"

for (const command of planStepCheck(collectChangedPaths(ROOT, PRIMARY_BRANCH))) {
  const result = spawnSync("pnpm", ["run", ...command], { cwd: ROOT, stdio: "inherit" })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
