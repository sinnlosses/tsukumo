// `pnpm run test:e2e:update` の入口。E2E の期待値（`test/e2e/expected/`）を撮り直す。
// 既定は `pnpm run check` と同じ選び方（`selectE2eFiles`）で選んだ E2E のファイルだけを撮り直す。

import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { collectChangedPaths, PRIMARY_BRANCH } from "./lib/changed-path-repository.ts"
import { readE2eSelection } from "./lib/e2e-selection-repository.ts"
import { describeE2eSelection } from "./lib/e2e-selection.ts"
import { type E2eUpdateArgument, readE2eUpdateArgument } from "./lib/e2e-update-argument.ts"

/** 撮り直す E2E のファイル。`all` は全件、`none` は撮り直すものが無い。 */
type UpdateTarget =
  | { readonly kind: "all" }
  | { readonly kind: "none" }
  | { readonly kind: "files"; readonly files: readonly string[] }

const E2E_UPDATE_USAGE = `使い方:
  node scripts/e2e-update.ts                              # 変えたファイルから選んだ E2E だけ
  node scripts/e2e-update.ts --full                       # 全件
  node scripts/e2e-update.ts test/e2e/<シナリオ>.test.ts  # 渡したファイルだけ
`

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const argument = readE2eUpdateArgument(process.argv.slice(2))

if (argument.kind === "help") {
  process.stderr.write(E2E_UPDATE_USAGE)
  process.exitCode = 2
} else if (argument.kind === "unknown") {
  process.stderr.write(`未知の引数: ${argument.flags.join(" ")}\n${E2E_UPDATE_USAGE}`)
  process.exitCode = 2
} else {
  const target = await chooseTarget(argument)
  if (target.kind !== "none") {
    const files = target.kind === "files" ? target.files : []
    const result = spawnSync("pnpm", ["run", "test:e2e", ...files], {
      cwd: ROOT,
      env: { ...process.env, E2E_UPDATE: "1" },
      stdio: "inherit",
    })
    process.exitCode = result.status ?? 1
  }
}

async function chooseTarget(
  argument: Exclude<E2eUpdateArgument, { kind: "help" } | { kind: "unknown" }>,
): Promise<UpdateTarget> {
  if (argument.kind === "full") {
    return { kind: "all" }
  }
  if (argument.kind === "files") {
    return { kind: "files", files: argument.files }
  }
  const changedPaths = collectChangedPaths(ROOT, PRIMARY_BRANCH)
  const { selection, total } = readE2eSelection(ROOT, changedPaths)
  process.stdout.write(`${describeE2eSelection(selection, total)}\n`)
  if (selection.kind === "all") {
    return { kind: "all" }
  }
  return selection.files.length === 0 ? { kind: "none" } : { kind: "files", files: selection.files }
}
