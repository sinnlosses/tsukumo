// `scripts/task-id.ts` の拾う・数える純粋関数を、小さな本文とID一覧で検証する。
// リポジトリ全体で重複が無いことを保つのは `test/task-id.test.ts` の役目。

import { describe, expect, test } from "bun:test"

import {
  extractHeadingTaskIds,
  findExcessiveTaskIdDuplicates,
  formatDuplicateTaskId,
} from "../../scripts/task-id.ts"

describe("extractHeadingTaskIds", () => {
  test("行頭の `## T-<数字>` からIDを拾う", () => {
    expect(
      extractHeadingTaskIds("## T-001 最初のタスク。\n\n本文\n\n## T-002 次のタスク。\n"),
    ).toEqual(["T-001", "T-002"])
  })

  test("行頭でない `## T-` や見出しでない行は拾わない", () => {
    expect(extractHeadingTaskIds("本文中の ## T-001 は見出しではない\n### T-002 は深い\n")).toEqual(
      [],
    )
  })
})

describe("findExcessiveTaskIdDuplicates", () => {
  test("重複が無ければ空", () => {
    expect(findExcessiveTaskIdDuplicates(["T-001", "T-002", "T-003"])).toEqual([])
  })

  test("既知の例外（T-225）でない重複は2回でも落とす", () => {
    expect(findExcessiveTaskIdDuplicates(["T-100", "T-100"])).toEqual([{ id: "T-100", count: 2 }])
  })

  test("T-225 は2回までは許すが、3回目からは落とす", () => {
    expect(findExcessiveTaskIdDuplicates(["T-225", "T-225"])).toEqual([])
    expect(findExcessiveTaskIdDuplicates(["T-225", "T-225", "T-225"])).toEqual([
      { id: "T-225", count: 3 },
    ])
  })
})

describe("formatDuplicateTaskId", () => {
  test("IDと出現回数を1行にする", () => {
    expect(formatDuplicateTaskId({ id: "T-100", count: 2 })).toBe("T-100: 2回")
  })
})
