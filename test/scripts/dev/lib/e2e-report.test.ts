import { describe, expect, it } from "vitest"

import {
  parseFailedFiles,
  parseFailedTests,
  parsePassedTests,
} from "../../../../scripts/dev/lib/check-failure.ts"
import { mergeE2eReports } from "../../../../scripts/dev/lib/e2e-report.ts"
import { parseSelectedTestCount } from "../../../../scripts/dev/lib/stage-verdict.ts"

const ROOT = "/repo"
const TEST_DIR = "/repo/test/e2e"

type Spec = { title: string; status: string }
type Suite = { title: string; specs: Spec[]; suites: Suite[] }

function spec(title: string, status: string): Spec {
  return { title, status }
}

function playwrightJson(files: readonly { file: string; suite: Suite }[]): string {
  return JSON.stringify({
    config: { projects: [{ testDir: TEST_DIR }] },
    suites: files.map(({ file, suite }) => ({ ...toJsonSuite(suite), file })),
  })
}

type JsonSuite = {
  title: string
  specs: { title: string; tests: { status: string }[] }[]
  suites: JsonSuite[]
}

function toJsonSuite(suite: Suite): JsonSuite {
  return {
    title: suite.title,
    specs: suite.specs.map((s) => ({ title: s.title, tests: [{ status: s.status }] })),
    suites: suite.suites.map(toJsonSuite),
  }
}

const NESTED: Suite = {
  title: "a.test.ts",
  specs: [spec("直下", "expected")],
  suites: [
    {
      title: "外",
      specs: [spec("飛ばす", "skipped")],
      suites: [
        {
          title: "内",
          specs: [spec("通る", "expected"), spec("落ちる", "unexpected")],
          suites: [],
        },
      ],
    },
  ],
}

const VITEST_JSON = JSON.stringify({
  numTotalTests: 2,
  numFailedTests: 1,
  testResults: [
    {
      name: "/repo/test/e2e/v.test.ts",
      status: "failed",
      assertionResults: [
        { status: "passed", fullName: "画面 開く" },
        { status: "failed", fullName: "画面 閉じる" },
      ],
    },
  ],
})

describe("mergeE2eReports", () => {
  const merged = mergeE2eReports(
    VITEST_JSON,
    playwrightJson([{ file: "a.test.ts", suite: NESTED }]),
  )

  it("Playwright の入れ子の題を空白でつなぎ、check の読み方で `<ファイル> > <題>` になる", () => {
    expect(parseFailedTests(merged, ROOT)).toEqual([
      "test/e2e/v.test.ts > 画面 閉じる",
      "test/e2e/a.test.ts > 外 内 落ちる",
    ])
    expect(parsePassedTests(merged, ROOT)).toEqual([
      "test/e2e/v.test.ts > 画面 開く",
      "test/e2e/a.test.ts > 直下",
      "test/e2e/a.test.ts > 外 内 通る",
    ])
  })

  it("落ちたファイルと数を、vitest の分と合わせる", () => {
    expect(parseFailedFiles(merged, ROOT)).toEqual({
      files: ["test/e2e/v.test.ts", "test/e2e/a.test.ts"],
      failedTestCount: 2,
    })
    expect(parseSelectedTestCount(merged)).toBe(6)
  })

  it("入れ子のどの深さの題も出力に残る（集めた件数と畳んだ件数が一致する）", () => {
    const playwrightOnly = mergeE2eReports(
      undefined,
      playwrightJson([{ file: "a.test.ts", suite: NESTED }]),
    )
    expect(parseSelectedTestCount(playwrightOnly)).toBe(countSpecs(NESTED))
  })

  it("片方の JSON が無いときは、もう片方だけで組む", () => {
    expect(parseSelectedTestCount(mergeE2eReports(VITEST_JSON, undefined))).toBe(2)
    expect(
      parseSelectedTestCount(
        mergeE2eReports(undefined, playwrightJson([{ file: "a.test.ts", suite: NESTED }])),
      ),
    ).toBe(4)
    expect(parseSelectedTestCount(mergeE2eReports("壊れた", undefined))).toBe(0)
  })
})

function countSpecs(suite: Suite): number {
  return suite.specs.length + suite.suites.reduce((sum, child) => sum + countSpecs(child), 0)
}
