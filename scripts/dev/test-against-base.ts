// 変えた単体テストを、主ブランチの一時の作業ツリーに重ねて走らせ、1 件も落ちなかったファイルを知らせる入口。
// 通ったファイルは赤を確かめていない印として出すだけで、止めはしない。
//
// 使い方:
//   pnpm run test-against-base

import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"

import {
  filesPassingOnBase,
  formatPassOnBase,
  selectChangedUnitTests,
} from "../shared/base-test-run.ts"
import { collectChangedPaths, PRIMARY_BRANCH } from "../shared/changed-path-repository.ts"
import {
  createReplayWorktree,
  linkDependencies,
  removeReplayWorktree,
} from "../shared/replay-worktree.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"

const changedTests = selectChangedUnitTests(collectChangedPaths(ROOT, PRIMARY_BRANCH)).filter(
  (file) => existsSync(join(ROOT, file)),
)

if (changedTests.length > 0) {
  for (const file of runOnBase(changedTests)) {
    process.stdout.write(`${formatPassOnBase(file)}\n`)
  }
}

function runOnBase(files: readonly string[]): string[] {
  const worktree = createReplayWorktree(ROOT, "test-against-base", PRIMARY_BRANCH)
  const outputDirectory = mkdtempSync(join(tmpdir(), "test-against-base-"))
  try {
    linkDependencies(ROOT, worktree)
    for (const file of files) {
      const destination = join(worktree.path, file)
      mkdirSync(dirname(destination), { recursive: true })
      cpSync(join(ROOT, file), destination)
    }
    const outputFile = join(outputDirectory, "result.json")
    spawnSync(
      "pnpm",
      ["exec", "vitest", "run", ...files, "--reporter=json", `--outputFile=${outputFile}`],
      { cwd: worktree.path, stdio: "ignore" },
    )
    return existsSync(outputFile) ? filesPassingOnBase(readFileSync(outputFile, "utf8"), files) : []
  } finally {
    removeReplayWorktree(ROOT, worktree)
    rmSync(outputDirectory, { recursive: true, force: true })
  }
}
