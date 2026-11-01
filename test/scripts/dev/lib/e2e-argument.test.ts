import { describe, expect, it } from "vitest"

import { parseE2eArgument, playwrightArguments } from "../../../../scripts/dev/lib/e2e-argument.ts"

const CHECK_ARGS = [
  "test/e2e/a.test.ts",
  "--bail=3",
  "--maxWorkers=4",
  "--reporter=default",
  "--reporter=json",
  "--outputFile.json=/tmp/report.json",
]

function runArgument(args: readonly string[]) {
  const argument = parseE2eArgument(args)
  if (argument.kind !== "run") {
    throw new Error("run のはず")
  }
  return argument
}

describe("parseE2eArgument", () => {
  it("check が渡す引数を読む", () => {
    expect(parseE2eArgument(CHECK_ARGS)).toEqual({
      kind: "run",
      files: ["test/e2e/a.test.ts"],
      bail: 3,
      maxWorkers: 4,
      reporters: ["default", "json"],
      jsonOutputFile: "/tmp/report.json",
    })
  })

  it("引数なしは全件（ファイルが空）", () => {
    expect(runArgument([]).files).toEqual([])
  })

  it.each([["--bogus"], ["--bail"], ["--bail=x"], ["--"], ["test/e2e/a.ts"]])(
    "知らない引数 %s は unknown",
    (arg) => {
      expect(parseE2eArgument(["test/e2e/a.test.ts", arg])).toEqual({
        kind: "unknown",
        arguments: [arg],
      })
    },
  )
})

describe("playwrightArguments", () => {
  it("bail・maxWorkers・reporter を Playwright の旗に写し、JSON を求められたら json を足す", () => {
    expect(playwrightArguments(runArgument(CHECK_ARGS))).toEqual([
      "test/e2e/a.test.ts",
      "--max-failures=3",
      "--workers=4",
      "--reporter=list,json",
    ])
  })

  it("JSON を求められていなければ list だけ", () => {
    expect(playwrightArguments(runArgument(["test/e2e/a.test.ts"]))).toEqual([
      "test/e2e/a.test.ts",
      "--reporter=list",
    ])
  })
})
