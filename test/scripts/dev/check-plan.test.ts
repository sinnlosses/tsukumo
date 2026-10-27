// `pnpm run check` が重い段（typecheck・lint・test:e2e）を省いてよいかの判定と、
// その材料になる「変えたファイル」の集め方を検証する。

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, test } from "vitest"

import {
  DOCUMENT_CHECK_TEST_PATHS,
  e2eStage,
  planStages,
} from "../../../scripts/dev/lib/check-stage.ts"
import { collectSetupFiles } from "../../../scripts/dev/lib/vitest-setup-file.ts"
import { collectChangedPaths } from "../../../scripts/shared/changed-path-repository.ts"
import { isDocumentOnlyChange, isDocumentPath } from "../../../scripts/shared/document-change.ts"
import { runSubprocessOrThrow } from "../../fixture/subprocess.ts"

describe("isDocumentPath", () => {
  test.each([
    ["docs/ 配下の .md", "docs/requirements.md", true],
    [".tw/ 配下の .md", ".tw/task/sample.md", true],
    ["直下の README.md", "README.md", true],
    ["直下の AGENTS.md", "AGENTS.md", true],
    [
      "src/ 配下の .md（同梱パックの persona.md など）",
      "src/server/character/adapter/pack/persona.md",
      false,
    ],
    ["docs/ 配下でも .md でないもの", "docs/screenshot.png", false],
    [".tw/ 配下でも .md でないもの", ".tw/config.toml", false],
    ["ディレクトリの下の README.md は直下扱いしない", "src/README.md", false],
  ])("%s", (_name, path, expected) => {
    expect(isDocumentPath(path)).toBe(expected)
  })
})

describe("isDocumentOnlyChange", () => {
  test("文書だけの変更なら true", () => {
    expect(isDocumentOnlyChange(["docs/requirements.md", ".tw/task/sample.md"])).toBe(true)
  })

  test("文書とコードが混ざっていれば false", () => {
    expect(isDocumentOnlyChange(["docs/requirements.md", "src/cli.ts"])).toBe(false)
  })

  test("変えたファイルが1件も無ければ false（全段を走らせる）", () => {
    expect(isDocumentOnlyChange([])).toBe(false)
  })
})

describe("E2E の bail", () => {
  test("check の E2E の段は bail を持ち、渡したファイルを前に置く", () => {
    expect(e2eStage([]).args).toEqual(["--bail=3"])
    expect(e2eStage(["test/e2e/a.test.ts"]).args).toEqual(["test/e2e/a.test.ts", "--bail=3"])
  })
})

describe("planStages", () => {
  const chosenStage = { name: "test:e2e", args: [], heavy: true }
  const choose = () => [chosenStage]
  const SETUP_FILES = [
    "test/tsukumo-home-setup.ts",
    "test/beads-template-setup.ts",
    "test/dom-setup.ts",
  ]

  test("文書だけの変更は E2E を選ばず、format:check・token-limit と文書の検査だけ", () => {
    const plan = planStages(
      ["docs/workflow.md", "AGENTS.md"],
      () => {
        throw new Error("E2E は選ばない")
      },
      false,
      SETUP_FILES,
    )
    expect(plan.stages).toEqual([
      { name: "format:check", args: [], heavy: false },
      { name: "token-limit", args: [], heavy: false },
      { name: "test:document", args: DOCUMENT_CHECK_TEST_PATHS, heavy: false },
    ])
    expect(DOCUMENT_CHECK_TEST_PATHS).toEqual(["test/document/", "test/scripts/document/"])
  })

  test("変えたファイルが空なら token-limit を含む6段すべて", () => {
    expect(planStages([], choose, false, SETUP_FILES).stages.map((stage) => stage.name)).toEqual([
      "typecheck",
      "lint",
      "format:check",
      "token-limit",
      "test",
      "test:e2e",
    ])
  })

  function unitStage(plan: ReturnType<typeof planStages>) {
    return plan.stages.find((stage) => stage.name === "test")
  }

  test("--full なら変えたファイルがあっても単体は全件", () => {
    const plan = planStages(["src/cli.ts"], choose, true, SETUP_FILES)
    expect(unitStage(plan)?.args).toEqual([])
    expect(plan.notice).toBe("")
  })

  test("変えたファイルが src・test・scripts にあれば、それらに関連する単体だけ", () => {
    const plan = planStages(
      ["src/cli.ts", "docs/workflow.md", "test/cli.test.ts"],
      choose,
      false,
      SETUP_FILES,
    )
    expect(unitStage(plan)?.args).toEqual(["--related", "src/cli.ts", "test/cli.test.ts"])
    expect(plan.notice).toBe("単体は変えたファイルに関連するものだけ")
  })

  test("設定だけの変更は単体を全件に戻す", () => {
    const plan = planStages(["package.json", "vitest.config.ts"], choose, false, SETUP_FILES)
    expect(unitStage(plan)?.args).toEqual([])
    expect(plan.notice).toBe("")
  })

  test("Vitest の準備のファイルを含む変更は、ほかに src があっても単体を全件に戻す", () => {
    const plan = planStages(["src/cli.ts", "test/dom-setup.ts"], choose, false, SETUP_FILES)
    expect(unitStage(plan)?.args).toEqual([])
    expect(plan.notice).toBe("")
  })

  test("準備のファイルは vitest.config.ts の globalSetup と projects 内の setupFiles から読める", async () => {
    const { default: config } = await import("../../../vitest.config.ts")
    expect(collectSetupFiles(config)).toEqual(SETUP_FILES)
  })

  test("並べて走らせる重い段は、文書だけの変更には無く、通常の組み立てにはある", () => {
    const documentOnly = planStages(["docs/history/decision.md"], choose, false, SETUP_FILES)
    const regular = planStages(["src/cli.ts"], choose, false, SETUP_FILES)
    expect(documentOnly.stages.some((stage) => stage.heavy)).toBe(false)
    expect(regular.stages.filter((stage) => stage.heavy).map((stage) => stage.name)).toEqual([
      "test",
      "test:e2e",
    ])
  })

  test("文書の検査のディレクトリが実在し、中にテストがある", () => {
    for (const directory of DOCUMENT_CHECK_TEST_PATHS) {
      expect(existsSync(directory)).toBe(true)
      expect(readdirSync(directory).some((name) => name.endsWith(".test.ts"))).toBe(true)
    }
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

      expect(collectChangedPaths(root, "trunk").toSorted()).toEqual([
        "README.md",
        join("docs", "committed.md"),
        "src/untracked.ts",
      ])
    })
  })

  test("主ブランチへ送ったあと（マージベースが主ブランチの先端）でも、枝のコミットの差分を拾う", async () => {
    await withRepository(async (root) => {
      write(root, ".tw/task/sample.md", "a\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "task")
      await git(root, "switch", "--quiet", "trunk")
      write(root, join("docs", "other.md"), "b\n")
      await git(root, "add", ".")
      await git(root, "commit", "--quiet", "-m", "other")
      await git(root, "switch", "--quiet", "work")
      await git(root, "rebase", "--quiet", "trunk")

      expect(collectChangedPaths(root, "trunk")).toEqual([".tw/task/sample.md"])
    })
  })
})
