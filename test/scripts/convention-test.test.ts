// 絞り込みの引数に規約のテストを足す組み立てを検証する。

import { describe, expect, test } from "vitest"

import { DOCUMENT_CHECK_TEST_FILES } from "../../scripts/lib/check-stage.ts"
import { CONVENTION_TEST_FILES, withConventionTests } from "../../scripts/lib/convention-test.ts"

describe("withConventionTests", () => {
  test("引数なしはそのまま（全件）", () => {
    expect(withConventionTests([])).toEqual([])
  })

  test("フラグだけならそのまま", () => {
    const args = ["--reporter=default", "--outputFile.json=/tmp/x.json"]
    expect(withConventionTests(args)).toEqual(args)
  })

  test("ファイルを渡すと規約のテストを後ろに足す", () => {
    expect(withConventionTests(["test/a.test.ts", "--reporter=json"])).toEqual([
      "test/a.test.ts",
      "--reporter=json",
      ...CONVENTION_TEST_FILES,
    ])
  })

  test("渡したファイルが規約のテストなら重ねない", () => {
    const result = withConventionTests(["test/task-id.test.ts"])
    expect(result.filter((arg) => arg === "test/task-id.test.ts")).toHaveLength(1)
    expect(result).toContain("test/architecture.test.ts")
  })

  test("フラグの値（-t パターン）は絞り込みに数えない", () => {
    const args = ["-t", "pattern"]
    expect(withConventionTests(args)).toEqual(args)
  })

  test("-- のあとのファイルも、値を取らないフラグの直後のファイルも数える", () => {
    expect(withConventionTests(["--", "test/a.test.ts"])).toEqual([
      "--",
      "test/a.test.ts",
      ...CONVENTION_TEST_FILES,
    ])
    expect(withConventionTests(["--coverage", "test/a.test.ts"])).toEqual([
      "--coverage",
      "test/a.test.ts",
      ...CONVENTION_TEST_FILES,
    ])
  })
})

describe("CONVENTION_TEST_FILES", () => {
  test("文書の検査の一覧を全て含む", () => {
    for (const file of DOCUMENT_CHECK_TEST_FILES) {
      expect(CONVENTION_TEST_FILES).toContain(file)
    }
  })
})
