// `pnpm run check` が落ちた重い段と落ちたテストを名指しする行の組み立てを検証する。

import { describe, expect, test } from "vitest"

import { describeFailedStages, parseFailedTests } from "../../scripts/lib/check-failure.ts"

describe("describeFailedStages", () => {
  test("全段が通ったときは空", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 0, failedTests: [] },
        { name: "test:e2e", status: 0, failedTests: [] },
      ]),
    ).toEqual([])
  })

  test("落ちた段だけを名前と終了コードの1行にする", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 0, failedTests: [] },
        { name: "test:e2e", status: 2, failedTests: [] },
      ]),
    ).toEqual(["test:e2e が終了コード 2 で落ちた"])
  })

  test("複数落ちたときは入力の順に並べる", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 1, failedTests: [] },
        { name: "test:e2e", status: 2, failedTests: [] },
      ]),
    ).toEqual(["test が終了コード 1 で落ちた", "test:e2e が終了コード 2 で落ちた"])
  })

  test("落ちたテストは段の行のあとに段ごとに並べる", () => {
    expect(
      describeFailedStages([
        { name: "test", status: 1, failedTests: ["test/a.test.ts > a b"] },
        { name: "test:e2e", status: 2, failedTests: ["test/e2e/c.test.ts > c"] },
      ]),
    ).toEqual([
      "test が終了コード 1 で落ちた",
      "test: test/a.test.ts > a b",
      "test:e2e が終了コード 2 で落ちた",
      "test:e2e: test/e2e/c.test.ts > c",
    ])
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
