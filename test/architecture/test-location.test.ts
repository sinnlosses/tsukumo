import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { listSourceFiles } from "./source-file.ts"

// 先頭から最初に合った行を使うので、空の接頭辞（`src/` の行）は最後に置く。
const MIRROR_ROOTS: readonly { readonly testPrefix: string; readonly targetRoot: string }[] = [
  { testPrefix: "scripts/", targetRoot: "scripts" },
  { testPrefix: "plugin/", targetRoot: "plugin" },
  { testPrefix: "", targetRoot: "src" },
]

const TARGET_ROOTS = ["src", "scripts", "plugin"] as const

// 同名の対象が別の場所にあるのに、鏡の場所に置かれていない既存のテスト（テスト側の `test/` 相対パス）。
// 直したら外す。新しく足さない。
const KNOWN_MISPLACED: ReadonlySet<string> = new Set<string>([
  "test/browser/components/domain/screen-nav/phone-head.test.tsx",
  "test/browser/components/domain/screen-nav/session-switcher.test.tsx",
  "test/browser/features/run-setting/run-setting-group.test.tsx",
  "test/browser/features/run-setting/run-setting-select.test.tsx",
  "test/browser/features/task-board/task-refresh-button.test.tsx",
  "test/scripts/capture/capture-preparation.test.ts",
  "test/scripts/capture/capture-source.test.ts",
  "test/scripts/capture/capture-stub.test.ts",
  "test/scripts/capture/catalog-index.test.ts",
  "test/scripts/capture/paper-hue.test.ts",
  "test/scripts/capture/paper-metric.test.ts",
  "test/scripts/capture/png-pixel.test.ts",
  "test/scripts/capture/reveal-snapshot.test.ts",
  "test/scripts/capture/scene-catalog.test.ts",
  "test/scripts/capture/scene-end.test.ts",
  "test/scripts/dev/built-ui-freshness.test.ts",
  "test/scripts/dev/check-failure.test.ts",
  "test/scripts/dev/check-record-repository.test.ts",
  "test/scripts/dev/check-record.test.ts",
  "test/scripts/dev/check-running.test.ts",
  "test/scripts/dev/convention-test.test.ts",
  "test/scripts/dev/e2e-entry-gate.test.ts",
  "test/scripts/dev/e2e-full-guard.test.ts",
  "test/scripts/dev/e2e-full-lock.test.ts",
  "test/scripts/dev/main-worktree.test.ts",
  "test/scripts/dev/ship-plan.test.ts",
  "test/scripts/dev/stage-priority.test.ts",
  "test/scripts/dev/submodule-drift.test.ts",
  "test/scripts/dev/worker-budget.test.ts",
  "test/scripts/document/document-index-repository.test.ts",
  "test/scripts/hook/background-verify.test.ts",
  "test/scripts/hook/broad-kill.test.ts",
  "test/scripts/hook/hook-denial-record.test.ts",
  "test/scripts/hook/shell-command.test.ts",
])

describe("テストの置き場所", () => {
  it("同名の対象が別の場所にあるテストは、鏡の場所（許す一覧を除く）に置かれている", () => {
    const targetPaths = TARGET_ROOTS.flatMap((root) =>
      listSourceFiles(`${REPOSITORY_ROOT}/${root}`).map((relPath) => `${root}/${relPath}`),
    )
    const targetsByName = Map.groupBy(targetPaths, (path) => stemOf(path))
    const targetPathSet = new Set(targetPaths.map(withoutExtension))

    const misplaced = listSourceFiles(`${REPOSITORY_ROOT}/test`)
      .filter((relPath) => !relPath.startsWith("e2e/") && !relPath.startsWith("architecture/"))
      .filter((relPath) => /\.test\.tsx?$/.test(relPath))
      .flatMap((relPath) => {
        const mirror = mirrorOf(relPath)
        const stem = stemOf(relPath.replace(/\.test(\.tsx?)$/, "$1"))
        const sameNamed = targetsByName.get(stem) ?? []
        return sameNamed.length > 0 && !targetPathSet.has(mirror) ? [{ relPath, sameNamed }] : []
      })

    const unexpected = misplaced
      .filter(({ relPath }) => !KNOWN_MISPLACED.has(`test/${relPath}`))
      .map(
        ({ relPath, sameNamed }) =>
          `test/${relPath} は ${sameNamed.map((target) => `test/${testPathFor(target)}`).join(" か ")} に置く`,
      )
    const misplacedPaths = new Set(misplaced.map(({ relPath }) => `test/${relPath}`))
    const stale = [...KNOWN_MISPLACED]
      .filter((path) => !misplacedPaths.has(path))
      .map((path) => `${path} は鏡の場所にあるか無くなっている。許す一覧から外す`)

    expect([...unexpected, ...stale]).toEqual([])
  })
})

/** テストの `test/` 相対パスから、鏡になる対象の拡張子なしのパス（`src/…`・`scripts/…`・`plugin/…`）を返す。 */
function mirrorOf(testRelPath: string): string {
  const base = testRelPath.replace(/\.test\.tsx?$/, "")
  const root = MIRROR_ROOTS.find(({ testPrefix }) => base.startsWith(testPrefix))
  if (root === undefined) {
    throw new Error(`鏡の根が決まらない: ${testRelPath}`)
  }
  return `${root.targetRoot}/${base.slice(root.testPrefix.length)}`
}

/** 対象のパス（`src/…`・`scripts/…`・`plugin/…`）から、その鏡の場所のテストの `test/` 相対パスを返す。 */
function testPathFor(targetPath: string): string {
  const slash = targetPath.indexOf("/")
  const root = targetPath.slice(0, slash)
  const rest = targetPath.slice(slash + 1)
  return `${root === "src" ? "" : `${root}/`}${rest.replace(/(\.tsx?)$/, ".test$1")}`
}

function withoutExtension(path: string): string {
  return path.replace(/\.tsx?$/, "")
}

function stemOf(path: string): string {
  return withoutExtension(path).split("/").at(-1) ?? path
}
