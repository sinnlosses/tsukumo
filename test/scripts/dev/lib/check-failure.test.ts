// `pnpm run check` が落ちた重い段と落ちたテストを名指しする行の組み立てを検証する。

import { describe, expect, test } from "vitest"

import {
  describeFailedStages,
  parseFailedFiles,
  parseFailedTests,
  shouldStopRunningStages,
  type StageOutcome,
} from "../../../../scripts/dev/lib/check-failure.ts"

function outcome(
  name: string,
  status: number,
  failedTests: readonly string[] = [],
  stopped = false,
): StageOutcome {
  return { name, status, failedTests, stopped }
}

describe("describeFailedStages", () => {
  test("全段が通ったときは空", () => {
    expect(describeFailedStages([outcome("test", 0), outcome("test:e2e", 0)])).toEqual([])
  })

  test("落ちた段だけを名前と終了コードの1行にし、複数なら入力の順に並べる", () => {
    expect(describeFailedStages([outcome("test", 0), outcome("test:e2e", 2)])).toEqual([
      "test:e2e が終了コード 2 で落ちた",
    ])
    expect(describeFailedStages([outcome("test", 1), outcome("test:e2e", 2)])).toEqual([
      "test が終了コード 1 で落ちた",
      "test:e2e が終了コード 2 で落ちた",
    ])
  })

  test("落ちたテストは段の行のあとに段ごとに並べる", () => {
    expect(
      describeFailedStages([
        outcome("test", 1, ["test/a.test.ts > a b"]),
        outcome("test:e2e", 2, ["test/e2e/c.test.ts > c"]),
      ]),
    ).toEqual([
      "test が終了コード 1 で落ちた",
      "test: test/a.test.ts > a b",
      "test:e2e が終了コード 2 で落ちた",
      "test:e2e: test/e2e/c.test.ts > c",
    ])
  })

  test("止めた段は落ちた段に数えず、最後の行に分けて出す", () => {
    expect(
      describeFailedStages([
        outcome("test", 1, ["test/a.test.ts"]),
        outcome("test:e2e", 143, [], true),
      ]),
    ).toEqual(["test が終了コード 1 で落ちた", "test: test/a.test.ts", "止めた段: test:e2e"])
  })
})

describe("shouldStopRunningStages", () => {
  test("終わった段が無い・全部通ったときは止めない", () => {
    expect(shouldStopRunningStages([])).toBe(false)
    expect(shouldStopRunningStages([outcome("test", 0)])).toBe(false)
  })

  test("終わった段のどれかが自分で落ちたら止める", () => {
    expect(shouldStopRunningStages([outcome("test", 0), outcome("test:e2e", 1)])).toBe(true)
  })

  test("軽い段が落ちたら、走っている重い段を止める", () => {
    expect(shouldStopRunningStages([outcome("lint", 1)])).toBe(true)
  })

  test("止められただけの段では、ほかを止めない", () => {
    expect(shouldStopRunningStages([outcome("test", 143, [], true)])).toBe(false)
  })
})

describe("parseFailedTests", () => {
  const report = (testResults: readonly unknown[]): string => JSON.stringify({ testResults })

  test("落ちたテストをルートからの相対ファイルとテスト名にする", () => {
    const json = report([
      {
        name: "/repo/test/a.test.ts",
        status: "failed",
        assertionResults: [
          { fullName: "a ok", status: "passed" },
          { fullName: "a ng", status: "failed" },
        ],
      },
    ])
    expect(parseFailedTests(json, "/repo")).toEqual(["test/a.test.ts > a ng"])
  })

  test("全部通ったときは空", () => {
    const json = report([{ name: "/repo/test/a.test.ts", status: "passed", assertionResults: [] }])
    expect(parseFailedTests(json, "/repo")).toEqual([])
  })

  test("落ちたファイルに落ちたテストが無いときはファイル名だけ", () => {
    const json = report([{ name: "/repo/test/a.test.ts", status: "failed", assertionResults: [] }])
    expect(parseFailedTests(json, "/repo")).toEqual(["test/a.test.ts"])
  })

  test("読めない・形が違う JSON は空", () => {
    expect(parseFailedTests("", "/repo")).toEqual([])
    expect(parseFailedTests("{", "/repo")).toEqual([])
    expect(parseFailedTests("[]", "/repo")).toEqual([])
    expect(parseFailedTests('{"testResults":3}', "/repo")).toEqual([])
  })
})

describe("parseFailedFiles", () => {
  test("bail で打ち切られたファイル（passed で assertionResults が空）は落ちたファイルに数えない", () => {
    const json = JSON.stringify({
      numFailedTests: 1,
      testResults: [
        {
          name: "/repo/test/e2e/a.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "a1", status: "failed" },
            { fullName: "a2", status: "pending" },
          ],
        },
        { name: "/repo/test/e2e/b.test.ts", status: "passed", assertionResults: [] },
      ],
    })
    expect(parseFailedFiles(json, "/repo")).toEqual({
      files: ["test/e2e/a.test.ts"],
      failedTestCount: 1,
    })
  })

  test("読めない JSON は空の列と 0", () => {
    expect(parseFailedFiles("{", "/repo")).toEqual({ files: [], failedTestCount: 0 })
  })
})
