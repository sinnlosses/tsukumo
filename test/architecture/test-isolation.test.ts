import { existsSync, readFileSync } from "node:fs"
import { matchesGlob } from "node:path"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { DOM_TEST_FILES, ISOLATED_FILES } from "../../vitest.config.ts"
import { withoutComments } from "./comment-line.ts"
import { listSourceFiles } from "./source-file.ts"

const MOCK_CALL = /\bvi\.mock\(/

function usesViMock(content: string): boolean {
  return MOCK_CALL.test(withoutComments(content))
}

/** 単体の `node` project（`isolate: false`）に入るテストか。 */
function isNodeProjectTest(path: string, domGlobs: readonly string[]): boolean {
  return !path.startsWith("test/e2e/") && !domGlobs.some((glob) => matchesGlob(path, glob))
}

/** `vi.mock(` を使うのに隔離の一覧に無い `node` project のテストを、名指しの行で返す。 */
function unisolatedMockTests(
  files: ReadonlyMap<string, string>,
  domGlobs: readonly string[],
  isolated: readonly string[],
): readonly string[] {
  return [...files]
    .filter(([path, content]) => isNodeProjectTest(path, domGlobs) && usesViMock(content))
    .filter(([path]) => !isolated.includes(path))
    .map(
      ([path]) =>
        `${path} は vi.mock を使うが ISOLATED_FILES に無い。vitest.config.ts の ISOLATED_FILES に挙げるか、vi.doMock + vi.resetModules() に直す（docs/coding-standards/test.md「置き場所とモック」）`,
    )
}

const MOCK_TEXT = `${["vi", "mock("].join(".")}"./a.ts")`
const DOO_MOCK_TEXT = `${["vi", "doMock("].join(".")}"./a.ts")`

describe("単体テストの隔離", () => {
  it("vi.mock を使う node project のテストは、すべて ISOLATED_FILES に挙げてある", () => {
    const files = new Map(
      listSourceFiles(`${REPOSITORY_ROOT}/test`).map((relPath) => [
        `test/${relPath}`,
        readFileSync(`${REPOSITORY_ROOT}/test/${relPath}`, "utf8"),
      ]),
    )

    expect(files.size).toBeGreaterThan(0)
    expect(unisolatedMockTests(files, DOM_TEST_FILES, ISOLATED_FILES)).toEqual([])
  })

  it("ISOLATED_FILES の各項目は実在し、vi.mock を使っている", () => {
    const stale = ISOLATED_FILES.filter(
      (path) =>
        !existsSync(`${REPOSITORY_ROOT}/${path}`) ||
        !usesViMock(readFileSync(`${REPOSITORY_ROOT}/${path}`, "utf8")),
    )

    expect(stale).toEqual([])
  })

  it("一覧外の node project のテストが vi.mock を使うと、パスを名指しして落とす", () => {
    const files = new Map([["test/server/x/a.test.ts", MOCK_TEXT]])

    expect(unisolatedMockTests(files, DOM_TEST_FILES, [])).toEqual([
      expect.stringContaining("test/server/x/a.test.ts は vi.mock を使うが ISOLATED_FILES に無い"),
    ])
  })

  it("一覧内・vi.mock なし・vi.doMock だけ・コメント行・dom project・e2e は落とさない", () => {
    const files = new Map([
      ["test/server/x/listed.test.ts", MOCK_TEXT],
      ["test/server/x/plain.test.ts", "const a = 1"],
      ["test/server/x/do.test.ts", DOO_MOCK_TEXT],
      ["test/server/x/comment.test.ts", `// ${MOCK_TEXT}`],
      ["test/browser/a/dom.test.tsx", MOCK_TEXT],
      ["test/e2e/flow.test.ts", MOCK_TEXT],
    ])

    expect(unisolatedMockTests(files, DOM_TEST_FILES, ["test/server/x/listed.test.ts"])).toEqual([])
  })
})
