// 絞り込みの引数に規約のテストを足す組み立てを検証する。

import { describe, expect, test } from "vitest"

import { DOCUMENT_CHECK_TEST_FILES } from "../../../scripts/dev/lib/check-stage.ts"
import {
  withConventionTests,
  withRelatedConventionTests,
} from "../../../scripts/dev/lib/convention-test.ts"

const CONVENTION_TEST_PATHS = [
  "test/architecture/",
  "test/function-order.test.ts",
  ...DOCUMENT_CHECK_TEST_FILES,
] as const

describe("withConventionTests", () => {
  test.each([
    ["引数なし（全件）", []],
    ["フラグだけ", ["--reporter=default", "--outputFile.json=/tmp/x.json"]],
    ["フラグの値（-t パターン）は絞り込みに数えない", ["-t", "pattern"]],
  ])("%s はそのまま", (_name, args) => {
    expect(withConventionTests(args)).toEqual(args)
  })

  test("ファイルを渡すと規約のテストを後ろに足す", () => {
    expect(withConventionTests(["test/a.test.ts", "--reporter=json"])).toEqual([
      "test/a.test.ts",
      "--reporter=json",
      ...CONVENTION_TEST_PATHS,
    ])
  })

  test("渡したファイルが規約のテストなら重ねない", () => {
    const result = withConventionTests(["test/scripts/document/task-id.test.ts"])
    expect(result.filter((arg) => arg === "test/scripts/document/task-id.test.ts")).toHaveLength(1)
    expect(result).toContain("test/architecture/")
  })

  test("-- のあとのファイルも、値を取らないフラグの直後のファイルも数える", () => {
    expect(withConventionTests(["--", "test/a.test.ts"])).toEqual([
      "--",
      "test/a.test.ts",
      ...CONVENTION_TEST_PATHS,
    ])
    expect(withConventionTests(["--coverage", "test/a.test.ts"])).toEqual([
      "--coverage",
      "test/a.test.ts",
      ...CONVENTION_TEST_PATHS,
    ])
  })
})

describe("withRelatedConventionTests", () => {
  const architectureTests = ["test/architecture/a.test.ts", "test/architecture/b.test.ts"]

  test("test/architecture/ はディレクトリでなく、テストファイルを1本ずつ足す", () => {
    const result = withRelatedConventionTests(["src/a.ts"], architectureTests)
    expect(result).not.toContain("test/architecture/")
    expect(result).toEqual([
      "src/a.ts",
      ...architectureTests,
      ...CONVENTION_TEST_PATHS.filter((path) => path !== "test/architecture/"),
    ])
  })

  test("渡したテストファイルは重ねない", () => {
    const result = withRelatedConventionTests(["test/architecture/a.test.ts"], architectureTests)
    expect(result.filter((arg) => arg === "test/architecture/a.test.ts")).toHaveLength(1)
  })
})
