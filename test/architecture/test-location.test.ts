import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { mirrorTestPath } from "../../scripts/shared/test-mirror.ts"
import { listSourceFiles } from "./source-file.ts"

// 先頭から最初に合った行を使うので、空の接頭辞（`src/` の行）は最後に置く。
const MIRROR_ROOTS: readonly { readonly testPrefix: string; readonly targetRoot: string }[] = [
  { testPrefix: "scripts/", targetRoot: "scripts" },
  { testPrefix: "plugin/", targetRoot: "plugin" },
  { testPrefix: "", targetRoot: "src" },
]

const TARGET_ROOTS = ["src", "scripts", "plugin"] as const

describe("テストの置き場所", () => {
  it("同名の対象が別の場所にあるテストは、鏡の場所に置かれている", () => {
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

    const unexpected = misplaced.map(
      ({ relPath, sameNamed }) =>
        `test/${relPath} は ${sameNamed.map(mirrorTestPath).join(" か ")} に置く`,
    )

    expect(unexpected).toEqual([])
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

function withoutExtension(path: string): string {
  return path.replace(/\.tsx?$/, "")
}

function stemOf(path: string): string {
  return withoutExtension(path).split("/").at(-1) ?? path
}
