import { describe, expect, it } from "vitest"

import {
  parseFailedFiles,
  parseFailedTests,
  parsePassedTests,
} from "../../../../scripts/dev/lib/check-failure.ts"
import { foldE2eReport } from "../../../../scripts/dev/lib/e2e-report.ts"
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

describe("foldE2eReport", () => {
  const folded = foldE2eReport(playwrightJson([{ file: "a.test.ts", suite: NESTED }]))

  it("Playwright の入れ子の題を空白でつなぎ、check の読み方で `<ファイル> > <題>` になる", () => {
    expect(parseFailedTests(folded, ROOT)).toEqual(["test/e2e/a.test.ts > 外 内 落ちる"])
    expect(parsePassedTests(folded, ROOT)).toEqual([
      "test/e2e/a.test.ts > 直下",
      "test/e2e/a.test.ts > 外 内 通る",
    ])
  })

  it("落ちたファイルと数を数える", () => {
    expect(parseFailedFiles(folded, ROOT)).toEqual({
      files: ["test/e2e/a.test.ts"],
      failedTestCount: 1,
    })
  })

  it("入れ子のどの深さの題も出力に残る（集めた件数と畳んだ件数が一致する）", () => {
    expect(parseSelectedTestCount(folded)).toBe(countSpecs(NESTED))
  })

  it("JSON が無いか壊れているときは空の結果になる", () => {
    expect(parseSelectedTestCount(foldE2eReport(undefined))).toBe(0)
    expect(parseSelectedTestCount(foldE2eReport("壊れた"))).toBe(0)
  })
})

function countSpecs(suite: Suite): number {
  return suite.specs.length + suite.suites.reduce((sum, child) => sum + countSpecs(child), 0)
}
