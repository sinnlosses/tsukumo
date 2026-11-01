// vitest の JSON レポートと `@playwright/test` の JSON レポートを、vitest の JSON の形（`check` が読む形）に合わせる。

import { resolve } from "node:path"

type AssertionResult = {
  readonly status: "passed" | "failed" | "skipped"
  readonly fullName: string
}

type FileResult = {
  readonly name: string
  readonly status: "passed" | "failed"
  readonly assertionResults: readonly AssertionResult[]
}

export function mergeE2eReports(
  vitestJson: string | undefined,
  playwrightJson: string | undefined,
): string {
  const vitest = readVitest(vitestJson)
  const playwright = foldPlaywright(playwrightJson)
  const playwrightAssertions = playwright.flatMap((file) => file.assertionResults)
  return JSON.stringify({
    numTotalTests: vitest.total + playwrightAssertions.length,
    numFailedTests:
      vitest.failed + playwrightAssertions.filter(({ status }) => status === "failed").length,
    testResults: [...vitest.files, ...playwright],
  })
}

function readVitest(json: string | undefined): {
  readonly files: readonly unknown[]
  readonly total: number
  readonly failed: number
} {
  const report = parseJson(json)
  if (!isRecord(report) || !Array.isArray(report.testResults)) {
    return { files: [], total: 0, failed: 0 }
  }
  return {
    files: report.testResults,
    total: typeof report.numTotalTests === "number" ? report.numTotalTests : 0,
    failed: typeof report.numFailedTests === "number" ? report.numFailedTests : 0,
  }
}

function foldPlaywright(json: string | undefined): readonly FileResult[] {
  const report = parseJson(json)
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    return []
  }
  const testDir = testDirectoryOf(report)
  return report.suites.flatMap((suite: unknown): readonly FileResult[] => {
    if (!isRecord(suite) || typeof suite.file !== "string") {
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
      isRecord(spec) && typeof spec.title === "string"
        ? [{ status: statusOf(spec), fullName: [...titles, spec.title].join(" ") }]
        : [],
    ),
    ...children.flatMap((child: unknown): readonly AssertionResult[] =>
      isRecord(child) && typeof child.title === "string"
        ? collectAssertions(child, [...titles, child.title])
        : [],
    ),
  ]
}

function statusOf(spec: Record<string, unknown>): AssertionResult["status"] {
  const tests = Array.isArray(spec.tests) ? spec.tests : []
  const statuses = tests.map((test: unknown) => (isRecord(test) ? test.status : undefined))
  if (statuses.includes("unexpected")) {
    return "failed"
  }
  return statuses.length > 0 && statuses.every((status) => status === "skipped")
    ? "skipped"
    : "passed"
}

/** Playwright の `file` は `testDir` からの相対。 */
function testDirectoryOf(report: Record<string, unknown>): string {
  const config = isRecord(report.config) ? report.config : {}
  const project = Array.isArray(config.projects) ? config.projects[0] : undefined
  if (isRecord(project) && typeof project.testDir === "string") {
    return project.testDir
  }
  return typeof config.rootDir === "string" ? config.rootDir : ""
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
