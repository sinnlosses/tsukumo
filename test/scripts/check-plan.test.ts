// `pnpm run check` が重い段（typecheck・lint・test:e2e）を省いてよいかの判定と、
// その材料になる「変えたファイル」の集め方を検証する。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  collectChangedPaths,
  resolvePrimaryBranch,
} from "../../scripts/lib/changed-path-repository.ts"
import { isDocumentOnlyChange, isDocumentPath } from "../../scripts/lib/document-change.ts"
import { writeProjectSettings } from "../fixture/project-settings.ts"
import { runSubprocessOrThrow } from "../fixture/subprocess.ts"

describe("isDocumentPath", () => {
  test("docs/ 配下の .md は文書", () => {
    expect(isDocumentPath("docs/requirements.md")).toBe(true)
  })

  test("develop/ 配下の .md は文書", () => {
    expect(isDocumentPath("develop/task/sample.md")).toBe(true)
  })

  test("直下の README.md・CLAUDE.md は文書", () => {
    expect(isDocumentPath("README.md")).toBe(true)
    expect(isDocumentPath("CLAUDE.md")).toBe(true)
  })

  test("src/ 配下の .md（同梱パックの persona.md など）は文書に入れない", () => {
    expect(isDocumentPath("src/server/character/adapter/pack/persona.md")).toBe(false)
  })

  test("docs/・develop/ 配下でも拡張子が .md でなければ文書ではない", () => {
    expect(isDocumentPath("docs/screenshot.png")).toBe(false)
  })

  test("同名でもディレクトリの下にある README.md・CLAUDE.md は直下扱いしない", () => {
    expect(isDocumentPath("src/README.md")).toBe(false)
  })
})

describe("isDocumentOnlyChange", () => {
  test("文書だけの変更なら true", () => {
    expect(isDocumentOnlyChange(["docs/requirements.md", "develop/task/sample.md"])).toBe(true)
  })

  test("文書とコードが混ざっていれば false", () => {
    expect(isDocumentOnlyChange(["docs/requirements.md", "src/cli.ts"])).toBe(false)
  })

  test("src/ 配下の .md が混ざっていれば false", () => {
    expect(
      isDocumentOnlyChange([
        "docs/requirements.md",
        "src/server/character/adapter/pack/persona.md",
      ]),
    ).toBe(false)
  })

  test("未追跡のファイル相当のパスが1件でもコードなら false", () => {
    expect(isDocumentOnlyChange(["src/server/new-feature/core/plan.ts"])).toBe(false)
  })

  test("変えたファイルが1件も無ければ false（全段を走らせる）", () => {
    expect(isDocumentOnlyChange([])).toBe(false)
  })
})

// 一時リポジトリで git を何回も走らせるので、`pnpm run check` の並列の負荷で既定の 5000ms を
// 超えることがある。
const GIT_LOAD_TIMEOUT_MS = 20_000

describe("collectChangedPaths", { timeout: GIT_LOAD_TIMEOUT_MS }, () => {
  async function git(root: string, ...args: string[]): Promise<void> {
    await runSubprocessOrThrow("git", args, { cwd: root })
  }

  function write(root: string, path: string, content: string): void {
    mkdirSync(join(root, dirname(path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }

  async function withRepository(run: (root: string) => Promise<void>): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), "check-plan-"))
    try {
      await git(root, "init", "--quiet", "--initial-branch=trunk")
      await git(root, "config", "user.email", "test@example.com")
      await git(root, "config", "user.name", "test")
      writeProjectSettings(root, "trunk")
      write(root, "README.md", "readme\n")
      write(root, ".gitignore", "ignored/\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "base")
      await git(root, "switch", "--quiet", "-c", "work")
      await run(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  test("コミット済み・未コミット・未追跡を合わせ、.gitignore の対象は除く", async () => {
    await withRepository(async (root) => {
      write(root, join("docs", "committed.md"), "a\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "docs")
      write(root, "README.md", "changed\n")
      write(root, "src/untracked.ts", "export {}\n")
      write(root, "ignored/build.js", "x\n")

      expect(collectChangedPaths(root, await resolvePrimaryBranch(root)).toSorted()).toEqual([
        "README.md",
        join("docs", "committed.md"),
        "src/untracked.ts",
      ])
    })
  })

  test("主ブランチへ送ったあと（マージベースが主ブランチの先端）でも、枝のコミットの差分を拾う", async () => {
    await withRepository(async (root) => {
      write(root, "develop/task/sample.md", "a\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "task")
      await git(root, "switch", "--quiet", "trunk")
      write(root, join("docs", "other.md"), "b\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "other")
      await git(root, "switch", "--quiet", "work")
      await git(root, "rebase", "--quiet", "trunk")

      expect(collectChangedPaths(root, "trunk")).toEqual(["develop/task/sample.md"])
    })
  })
})
