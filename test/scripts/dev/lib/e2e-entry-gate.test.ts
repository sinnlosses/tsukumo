// E2E の vitest を入口を経ずに起こしたときの門の判定を確かめる。

import { describe, expect, test } from "vitest"

import {
  E2E_ENTRY_ENVIRONMENT,
  findDirectE2eStartRefusal,
} from "../../../../scripts/dev/lib/e2e-entry-gate.ts"

const DIRECT_ALL = ["run", "--config", "vitest.e2e.config.ts"]
const DIRECT_ONE = [...DIRECT_ALL, "test/e2e/fictional.test.ts", "-t", "架空の it"]

describe("findDirectE2eStartRefusal", () => {
  test("入口を経ずファイルも名指さない起動は、サブエージェントの Bash の中なら入口の打ち方を案内して止める", () => {
    expect(
      findDirectE2eStartRefusal({ entryValue: undefined, args: DIRECT_ALL, hasSubagentMark: true }),
    ).toContain("pnpm run test:e2e test/e2e/")
  })

  test("テストのファイルを名指した直の起動は、-t で絞っていてもサブエージェントの Bash の中で通す", () => {
    expect(
      findDirectE2eStartRefusal({ entryValue: undefined, args: DIRECT_ONE, hasSubagentMark: true }),
    ).toBeUndefined()
  })

  test("入口を経た起動は、サブエージェントの Bash の中でも通す", () => {
    expect(
      findDirectE2eStartRefusal({
        entryValue: E2E_ENTRY_ENVIRONMENT.TSUKUMO_E2E_ENTRY,
        args: DIRECT_ALL,
        hasSubagentMark: true,
      }),
    ).toBeUndefined()
  })

  test("サブエージェントの Bash の外なら、入口を経なくても通す", () => {
    expect(
      findDirectE2eStartRefusal({
        entryValue: undefined,
        args: DIRECT_ALL,
        hasSubagentMark: false,
      }),
    ).toBeUndefined()
  })
})
