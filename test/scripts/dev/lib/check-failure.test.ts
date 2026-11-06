// `pnpm run check` が落ちた重い段と落ちたテストを名指しする行の組み立てを検証する。

import { describe, expect, test } from "vitest"

import {
  describeFailedStages,
  parseFailedFiles,
  parseFailedTests,
  parsePassedTests,
  parseSelectedTestCount,
  pickStagesToStop,
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

describe("pickStagesToStop", () => {
  const running = [
    { name: "lint", heavy: false },
    { name: "token-limit", heavy: false },
    { name: "test", heavy: true },
    { name: "test:e2e", heavy: true },
  ]

  test("軽い段が落ちても、止めるのは重い段だけで、ほかの軽い段は止めない", () => {
    expect(pickStagesToStop(running, [outcome("lint", 1)]).map((stage) => stage.name)).toEqual([
      "test",
      "test:e2e",
    ])
  })

  test("落ちた段が無ければ何も止めない", () => {
    expect(pickStagesToStop(running, [])).toEqual([])
    expect(pickStagesToStop(running, [outcome("lint", 0)])).toEqual([])
  })

  test("重い段が落ちたら、走っている重い段を止める", () => {
    expect(pickStagesToStop(running, [outcome("test", 1)])).toHaveLength(2)
  })

  test("止められただけの段では、ほかを止めない", () => {
    expect(pickStagesToStop(running, [outcome("test", 143, [], true)])).toEqual([])
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
    expect(parseFailedTests(json, "/repo", "vitest")).toEqual(["test/a.test.ts > a ng"])
  })

  test("全部通ったときは空", () => {
    const json = report([{ name: "/repo/test/a.test.ts", status: "passed", assertionResults: [] }])
    expect(parseFailedTests(json, "/repo", "vitest")).toEqual([])
  })

  test("落ちたファイルに落ちたテストが無いときはファイル名だけ", () => {
    const json = report([{ name: "/repo/test/a.test.ts", status: "failed", assertionResults: [] }])
    expect(parseFailedTests(json, "/repo", "vitest")).toEqual(["test/a.test.ts"])
  })

  test("読めない・形が違う JSON は空", () => {
    expect(parseFailedTests("", "/repo", "vitest")).toEqual([])
    expect(parseFailedTests("{", "/repo", "vitest")).toEqual([])
    expect(parseFailedTests("[]", "/repo", "vitest")).toEqual([])
    expect(parseFailedTests('{"testResults":3}', "/repo", "vitest")).toEqual([])
  })
})

describe("parsePassedTests", () => {
  test("通ったテストだけを parseFailedTests と同じ書式で返し、読めない JSON は空", () => {
    const json = JSON.stringify({
      testResults: [
        {
          name: "/repo/test/a.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "a ok", status: "passed" },
            { fullName: "a ng", status: "failed" },
          ],
        },
      ],
    })
    expect(parsePassedTests(json, "/repo", "vitest")).toEqual(["test/a.test.ts > a ok"])
    expect(parsePassedTests("{", "/repo", "vitest")).toEqual([])
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
    expect(parseFailedFiles(json, "/repo", "vitest")).toEqual({
      files: ["test/e2e/a.test.ts"],
      failedTestCount: 1,
    })
  })

  test("読めない JSON は空の列と 0", () => {
    expect(parseFailedFiles("{", "/repo", "vitest")).toEqual({ files: [], failedTestCount: 0 })
  })
})

describe("Playwright の JSON を直接読む", () => {
  const json = JSON.stringify({
    config: { projects: [{ testDir: "/repo/test/e2e" }] },
    stats: { expected: 2, unexpected: 1, flaky: 0, skipped: 1 },
    suites: [
      {
        title: "a.test.ts",
        file: "a.test.ts",
        specs: [{ title: "直下", tests: [{ status: "expected" }] }],
        suites: [
          {
            title: "外",
            specs: [{ title: "飛ばす", tests: [{ status: "skipped" }] }],
            suites: [
              {
                title: "内",
                specs: [
                  { title: "通る", tests: [{ status: "expected" }] },
                  { title: "落ちる", tests: [{ status: "unexpected" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  test("入れ子の題を空白でつなぎ、落ちたテストと通ったテストを `<ファイル> > <題>` にする", () => {
    expect(parseFailedTests(json, "/repo", "playwright")).toEqual([
      "test/e2e/a.test.ts > 外 内 落ちる",
    ])
    expect(parsePassedTests(json, "/repo", "playwright")).toEqual([
      "test/e2e/a.test.ts > 直下",
      "test/e2e/a.test.ts > 外 内 通る",
    ])
  })

  test("落ちたファイルと数を stats から読む", () => {
    expect(parseFailedFiles(json, "/repo", "playwright")).toEqual({
      files: ["test/e2e/a.test.ts"],
      failedTestCount: 1,
    })
  })

  test("選ばれた総数は stats の合計、vitest は numTotalTests", () => {
    expect(parseSelectedTestCount(json, "playwright")).toBe(4)
    expect(parseSelectedTestCount(JSON.stringify({ numTotalTests: 7 }), "vitest")).toBe(7)
  })

  test("読めない・形が違う JSON は空と undefined", () => {
    expect(parseFailedTests("{", "/repo", "playwright")).toEqual([])
    expect(parseFailedFiles("{}", "/repo", "playwright")).toEqual({ files: [], failedTestCount: 0 })
    expect(parseSelectedTestCount("not json", "playwright")).toBeUndefined()
    expect(parseSelectedTestCount("{}", "vitest")).toBeUndefined()
  })
})
