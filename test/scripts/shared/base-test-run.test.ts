import { describe, expect, it } from "vitest"

import {
  filesPassingOnBase,
  formatPassOnBase,
  selectChangedUnitTests,
} from "../../../scripts/shared/base-test-run.ts"

describe("selectChangedUnitTests", () => {
  it("単体テストだけを残し、E2E と規約のテストと本体は除く", () => {
    expect(
      selectChangedUnitTests([
        "test/server/a.test.ts",
        "test/browser/b.test.tsx",
        "test/e2e/c.test.ts",
        "test/architecture/d.test.ts",
        "src/server/a.ts",
      ]),
    ).toEqual(["test/server/a.test.ts", "test/browser/b.test.tsx"])
  })
})

describe("filesPassingOnBase", () => {
  const json = JSON.stringify({
    testResults: [
      { name: "/w/test/x/fails.test.ts", status: "failed" },
      { name: "/w/test/x/passes.test.ts", status: "passed" },
    ],
  })

  it("落ちたファイルは出さず、通ったファイルを出す", () => {
    expect(filesPassingOnBase(json, ["test/x/fails.test.ts", "test/x/passes.test.ts"])).toEqual([
      "test/x/passes.test.ts",
    ])
  })

  it("結果に無いファイルは出さない", () => {
    expect(filesPassingOnBase(json, ["test/x/missing.test.ts"])).toEqual([])
  })

  it("壊れた json は例外", () => {
    expect(() => filesPassingOnBase("{}", ["a"])).toThrow("testResults")
  })
})

describe("formatPassOnBase", () => {
  it("タブ区切りの1行にする", () => {
    expect(formatPassOnBase("test/a.test.ts")).toBe("TESTS_PASS_ON_BASE\ttest/a.test.ts")
  })
})
