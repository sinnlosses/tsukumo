// `pnpm run check` の重い段の結果から、落ちた段と落ちたテストを名指しする行を組み立てる。

import { relative, resolve } from "node:path"

import { isPlainObject } from "remeda"

import { parseJson } from "../../../src/shared/utils/parse-json.ts"

export type StageOutcome = {
  readonly name: string
  readonly status: number
  /** `parseFailedTests` の結果。JSON が読めなかった段は空。 */
  readonly failedTests: readonly string[]
  /** 別の段が落ちたため、走っている途中で止めた段。 */
  readonly stopped: boolean
}

/** JSON レポートを書いたランナー。単体の段は vitest、E2E の段は Playwright。 */
export type TestRunner = "vitest" | "playwright"

export type FailedFiles = {
  /** 落ちたファイルのルートからの相対パス。 */
  readonly files: readonly string[]
  /** 落ちたテストの数。`--max-failures` が発火したかをこの数で見る。 */
  readonly failedTestCount: number
}

/**
 * 終わった段のどれかが自分で落ちたなら、走っている段のうち重い段だけを止める対象にする。
 * 数秒で終わる軽い段は止めず、落ちを1回の出力に並べる。
 */
export function pickStagesToStop<T extends { readonly heavy: boolean }>(
  running: readonly T[],
  finished: readonly StageOutcome[],
): readonly T[] {
  return shouldStopRunningStages(finished) ? running.filter((stage) => stage.heavy) : []
}

/**
 * 自分で落ちた段（止めた段を除く終了コードが 0 でない段）ごとに、段の名前と終了コードの1行と、
 * 続けて落ちたテストの `<段>: <ファイル> > <テスト名>` を1件1行で、入力の順に返す。
 * 止めた段があれば、最後に `止めた段: <段>, …` の1行を足す。
 */
export function describeFailedStages(outcomes: readonly StageOutcome[]): readonly string[] {
  const failed = outcomes
    .filter((outcome) => outcome.status !== 0 && !outcome.stopped)
    .flatMap((outcome) => [
      `${outcome.name} が終了コード ${outcome.status} で落ちた`,
      ...outcome.failedTests.map((test) => `${outcome.name}: ${test}`),
    ])
  const stopped = outcomes.filter((outcome) => outcome.stopped).map((outcome) => outcome.name)
  return stopped.length === 0 ? failed : [...failed, `止めた段: ${stopped.join(", ")}`]
}

/**
 * JSON レポートから、落ちたテストを `<ルートからの相対ファイル> > <テスト名>` の列にする。
 * 落ちたファイルに落ちたテストが無いとき（読み込みの失敗など）はファイル名だけの1行。
 * 読めない・形が違う JSON は空の列。
 */
export function parseFailedTests(
  json: string,
  root: string,
  runner: TestRunner,
): readonly string[] {
  return readReport(json, root, runner)
    .files.filter((file) => file.failed)
    .flatMap((file) => {
      const titles = file.tests.filter((test) => test.status === "failed")
      return titles.length === 0
        ? [file.path]
        : titles.map((test) => `${file.path} > ${test.title}`)
    })
}

/**
 * JSON レポートから、通ったテストを `parseFailedTests` と同じ
 * `<ルートからの相対ファイル> > <テスト名>` の列にする。読めない・形が違う JSON は空の列。
 */
export function parsePassedTests(
  json: string,
  root: string,
  runner: TestRunner,
): readonly string[] {
  return readReport(json, root, runner).files.flatMap((file) =>
    file.tests
      .filter((test) => test.status === "passed")
      .map((test) => `${file.path} > ${test.title}`),
  )
}

/**
 * JSON レポートから、落ちたファイルと落ちたテストの数を読む。
 * 打ち切られたファイルは落ちたファイルには入らない。
 * 読めない・形が違う JSON は空の列と 0。
 */
export function parseFailedFiles(json: string, root: string, runner: TestRunner): FailedFiles {
  const report = readReport(json, root, runner)
  return {
    files: report.files.filter((file) => file.failed).map((file) => file.path),
    failedTestCount: report.failedTestCount,
  }
}

/**
 * JSON レポートから、選ばれたテストの総数を読む。
 * 読めない・形が違う JSON は `undefined`。
 */
export function parseSelectedTestCount(json: string, runner: TestRunner): number | undefined {
  const report = parseJson(json)
  if (!isPlainObject(report)) {
    return undefined
  }
  if (runner === "vitest") {
    return typeof report.numTotalTests === "number" ? report.numTotalTests : undefined
  }
  const stats = report.stats
  if (!isPlainObject(stats)) {
    return undefined
  }
  const counts = [stats.expected, stats.unexpected, stats.flaky, stats.skipped]
  return counts.every((count) => typeof count === "number")
    ? counts.reduce((sum: number, count) => sum + Number(count), 0)
    : undefined
}

type ReadTest = { readonly title: string; readonly status: "passed" | "failed" | "other" }

type ReadFile = {
  readonly path: string
  readonly failed: boolean
  readonly tests: readonly ReadTest[]
}

type ReadReport = { readonly files: readonly ReadFile[]; readonly failedTestCount: number }

const EMPTY_REPORT = { files: [], failedTestCount: 0 } as const satisfies ReadReport

/** 読めない・形が違う JSON は空のレポート。 */
function readReport(json: string, root: string, runner: TestRunner): ReadReport {
  const report = parseJson(json)
  if (!isPlainObject(report)) {
    return EMPTY_REPORT
  }
  return runner === "vitest" ? readVitest(report, root) : readPlaywright(report, root)
}

function readVitest(report: Record<string, unknown>, root: string): ReadReport {
  if (!Array.isArray(report.testResults)) {
    return EMPTY_REPORT
  }
  const files = report.testResults.flatMap((file: unknown): readonly ReadFile[] => {
    if (!isPlainObject(file) || typeof file.name !== "string") {
      return []
    }
    const tests = Array.isArray(file.assertionResults)
      ? file.assertionResults.flatMap((test: unknown): readonly ReadTest[] =>
          isPlainObject(test) && typeof test.fullName === "string"
            ? [{ title: test.fullName, status: vitestStatus(test.status) }]
            : [],
        )
      : []
    return [{ path: relative(root, file.name), failed: file.status === "failed", tests }]
  })
  const failedTestCount = typeof report.numFailedTests === "number" ? report.numFailedTests : 0
  return { files, failedTestCount }
}

function vitestStatus(status: unknown): ReadTest["status"] {
  return status === "passed" || status === "failed" ? status : "other"
}

function readPlaywright(report: Record<string, unknown>, root: string): ReadReport {
  if (!Array.isArray(report.suites)) {
    return EMPTY_REPORT
  }
  const testDir = testDirectoryOf(report)
  const files = report.suites.flatMap((suite: unknown): readonly ReadFile[] => {
    if (!isPlainObject(suite) || typeof suite.file !== "string") {
      return []
    }
    const tests = collectTests(suite, [])
    return [
      {
        path: relative(root, resolve(testDir, suite.file)),
        failed: tests.some((test) => test.status === "failed"),
        tests,
      },
    ]
  })
  const stats = isPlainObject(report.stats) ? report.stats : {}
  const failedTestCount = typeof stats.unexpected === "number" ? stats.unexpected : 0
  return { files, failedTestCount }
}

/** `describe` の題を空白でつないだ題にする（ファイルの層の題は含めない）。 */
function collectTests(
  suite: Record<string, unknown>,
  titles: readonly string[],
): readonly ReadTest[] {
  const specs = Array.isArray(suite.specs) ? suite.specs : []
  const children = Array.isArray(suite.suites) ? suite.suites : []
  return [
    ...specs.flatMap((spec: unknown): readonly ReadTest[] =>
      isPlainObject(spec) && typeof spec.title === "string"
        ? [{ title: [...titles, spec.title].join(" "), status: playwrightStatus(spec) }]
        : [],
    ),
    ...children.flatMap((child: unknown): readonly ReadTest[] =>
      isPlainObject(child) && typeof child.title === "string"
        ? collectTests(child, [...titles, child.title])
        : [],
    ),
  ]
}

function playwrightStatus(spec: Record<string, unknown>): ReadTest["status"] {
  const tests = Array.isArray(spec.tests) ? spec.tests : []
  const statuses = tests.map((test: unknown) => (isPlainObject(test) ? test.status : undefined))
  if (statuses.includes("unexpected")) {
    return "failed"
  }
  return statuses.length > 0 && statuses.every((status) => status === "skipped")
    ? "other"
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

/** 止められた段は数えない。 */
function shouldStopRunningStages(finished: readonly StageOutcome[]): boolean {
  return finished.some((outcome) => outcome.status !== 0 && !outcome.stopped)
}
