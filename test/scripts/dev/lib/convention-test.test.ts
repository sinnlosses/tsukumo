// 絞り込みの引数に規約のテストを足す組み立てを検証する。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, test } from "vitest"

import { DOCUMENT_CHECK_TEST_PATHS } from "../../../../scripts/dev/lib/check-stage.ts"
import {
  listConventionTests,
  withConventionTests,
  withRelatedConventionTests,
} from "../../../../scripts/dev/lib/convention-test.ts"
import { REPOSITORY_ROOT } from "../../../../scripts/shared/repository-root.ts"

const CONVENTION_TEST_PATHS = ["test/architecture/", ...DOCUMENT_CHECK_TEST_PATHS] as const

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
  const conventionTests = ["test/architecture/a.test.ts", "test/document/b.test.ts"]

  test("規約のディレクトリでなく、列挙したテストファイルを1本ずつ足す", () => {
    expect(withRelatedConventionTests(["src/a.ts"], conventionTests)).toEqual([
      "src/a.ts",
      ...conventionTests,
    ])
  })

  test("渡したテストファイルは重ねない", () => {
    const result = withRelatedConventionTests(["test/architecture/a.test.ts"], conventionTests)
    expect(result.filter((arg) => arg === "test/architecture/a.test.ts")).toHaveLength(1)
  })
})

describe("listConventionTests", () => {
  test("規約のディレクトリの下のテストを入れ子まで列挙し、テスト以外は拾わない", () => {
    const root = mkdtempSync(join(tmpdir(), "convention-test-"))
    try {
      for (const path of [
        "test/architecture/a.test.ts",
        "test/architecture/helper.ts",
        "test/document/b.test.tsx",
        "test/scripts/document/lib/c.test.ts",
        "test/scripts/document/d.test.ts",
        "test/other/e.test.ts",
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true })
        writeFileSync(join(root, path), "")
      }
      expect(listConventionTests(root)).toEqual([
        "test/architecture/a.test.ts",
        "test/document/b.test.tsx",
        "test/scripts/document/d.test.ts",
        "test/scripts/document/lib/c.test.ts",
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("実物のリポジトリでは、移した文書の検査と入れ子の検査を含む", () => {
    const listed = listConventionTests(REPOSITORY_ROOT)
    expect(listed).toContain("test/document/e2e-reference.test.ts")
    expect(listed).toContain("test/scripts/document/lib/environment-variable-repository.test.ts")
    expect(listed).toContain("test/architecture/function-order.test.ts")
  })
})
