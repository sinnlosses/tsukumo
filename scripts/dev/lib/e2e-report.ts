// `@playwright/test` の JSON レポートを、vitest の JSON の形（`check` が読む形）に合わせる。

import { resolve } from "node:path"

import { isPlainObject } from "remeda"

import { parseJson } from "../../../src/shared/utils/parse-json.ts"

type AssertionResult = {
  readonly status: "passed" | "failed" | "skipped"
  readonly fullName: string
}

type FileResult = {
  readonly name: string
  readonly status: "passed" | "failed"
  readonly assertionResults: readonly AssertionResult[]
}

export function foldE2eReport(playwrightJson?: string): string {
  const playwright = foldPlaywright(playwrightJson)
  const assertions = playwright.flatMap((file) => file.assertionResults)
  return JSON.stringify({
    numTotalTests: assertions.length,
    numFailedTests: assertions.filter(({ status }) => status === "failed").length,
    testResults: playwright,
  })
}

function foldPlaywright(json?: string): readonly FileResult[] {
  const report = json === undefined ? undefined : parseJson(json)
  if (!isPlainObject(report) || !Array.isArray(report.suites)) {
    return []
  }
  const testDir = testDirectoryOf(report)
  return report.suites.flatMap((suite: unknown): readonly FileResult[] => {
    if (!isPlainObject(suite) || typeof suite.file !== "string") {
      return []
    }
    const assertionResults = collectAssertions(suite, [])
    return [
      {
        name: resolve(testDir, suite.file),
        status: assertionResults.some(({ status }) => status === "failed") ? "failed" : "passed",
        assertionResults,
      },
    ]
  })
}

/** `describe` の題を空白でつないだ `fullName` にする（ファイルの層の題は含めない）。 */
function collectAssertions(
  suite: Record<string, unknown>,
  titles: readonly string[],
): readonly AssertionResult[] {
  const specs = Array.isArray(suite.specs) ? suite.specs : []
  const children = Array.isArray(suite.suites) ? suite.suites : []
  return [
    ...specs.flatMap((spec: unknown): readonly AssertionResult[] =>
      isPlainObject(spec) && typeof spec.title === "string"
        ? [{ status: statusOf(spec), fullName: [...titles, spec.title].join(" ") }]
        : [],
    ),
    ...children.flatMap((child: unknown): readonly AssertionResult[] =>
      isPlainObject(child) && typeof child.title === "string"
        ? collectAssertions(child, [...titles, child.title])
        : [],
    ),
  ]
}

function statusOf(spec: Record<string, unknown>): AssertionResult["status"] {
  const tests = Array.isArray(spec.tests) ? spec.tests : []
  const statuses = tests.map((test: unknown) => (isPlainObject(test) ? test.status : undefined))
  if (statuses.includes("unexpected")) {
    return "failed"
  }
  return statuses.length > 0 && statuses.every((status) => status === "skipped")
    ? "skipped"
    : "passed"
}

/** Playwright の `file` は `testDir` からの相対。 */
function testDirectoryOf(report: Record<string, unknown>): string {
  const config = isPlainObject(report.config) ? report.config : {}
  const project = Array.isArray(config.projects) ? config.projects[0] : undefined
  if (isPlainObject(project) && typeof project.testDir === "string") {
    return project.testDir
  }
  return typeof config.rootDir === "string" ? config.rootDir : ""
}
