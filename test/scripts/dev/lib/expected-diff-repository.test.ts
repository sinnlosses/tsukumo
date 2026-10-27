import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { readExpectedDiffLines } from "../../../../scripts/dev/lib/expected-diff-repository.ts"
import { git, initGitRepository } from "../../../fixture/git-repository.ts"

// 一時リポジトリで git を何回も走らせるので、`pnpm run check` の並列の負荷で既定の 5000ms を超えることがある。
const GIT_LOAD_TIMEOUT_MS = 20_000

const EXPECTED = "test/e2e/expected"

describe("readExpectedDiffLines", { timeout: GIT_LOAD_TIMEOUT_MS }, () => {
  test("コミット済み・未コミットの差分と未追跡のファイルを合わせ、置き場の外は数えない", async () => {
    const root = mkdtempSync(join(tmpdir(), "expected-diff-"))
    try {
      await initGitRepository(root)
      mkdirSync(join(root, EXPECTED), { recursive: true })
      writeFileSync(join(root, EXPECTED, "a.dom.json"), "1\n2\n3\n")
      writeFileSync(join(root, EXPECTED, "b.dom.json"), "1\n2\n")
      writeFileSync(join(root, "outside.ts"), "x\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "base")
      await git(root, "switch", "--quiet", "-c", "work")

      writeFileSync(join(root, EXPECTED, "a.dom.json"), "1\n2\nthree\n")
      await git(root, "commit", "--quiet", "-am", "change a")
      rmSync(join(root, EXPECTED, "b.dom.json"))
      writeFileSync(join(root, EXPECTED, "c.dom-pick.json"), "1\n2\n3\n4")
      writeFileSync(join(root, "outside.ts"), "y\nz\n")

      expect(readExpectedDiffLines(root, "main")).toBe(2 + 2 + 4)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("主ブランチとのマージベースが引けなければ undefined", async () => {
    const root = mkdtempSync(join(tmpdir(), "expected-diff-"))
    try {
      await initGitRepository(root, "trunk")
      writeFileSync(join(root, "a.ts"), "a\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "base")

      expect(readExpectedDiffLines(root, "main")).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
