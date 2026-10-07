import { describe, expect, it } from "vitest"

import {
  doneTasksOfBeadsIssues,
  taskSummaryItemsOfBeadsIssues,
} from "../../../../src/server/repository/adapter/beads-task.ts"
import type { BeadsIssue } from "../../../../src/server/repository/adapter/beads.ts"

function issue(overrides: Partial<BeadsIssue> & Pick<BeadsIssue, "id" | "status">): BeadsIssue {
  return {
    title: `架空の${overrides.id}`,
    blockedBy: [],
    assignee: undefined,
    createdAtEpochMilliseconds: 0,
    closedAtEpochMilliseconds: undefined,
    description: "",
    acceptanceCriteria: "",
    notes: "",
    externalRef: undefined,
    ...overrides,
  }
}

describe("taskSummaryItemsOfBeadsIssues", () => {
  it("組み込みの状態を todo・doing・hold・done に読み替え、ほかの値は生のまま出す", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-1", status: "open", createdAtEpochMilliseconds: 1 }),
      issue({ id: "t-2", status: "in_progress", createdAtEpochMilliseconds: 2 }),
      issue({ id: "t-3", status: "deferred", createdAtEpochMilliseconds: 3 }),
      issue({
        id: "t-4",
        status: "closed",
        createdAtEpochMilliseconds: 4,
        closedAtEpochMilliseconds: 10,
      }),
      issue({ id: "t-5", status: "pending", createdAtEpochMilliseconds: 5 }),
      issue({ id: "t-6", status: "blocked", createdAtEpochMilliseconds: 6 }),
    ])

    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["t-1", "todo"],
      ["t-2", "doing"],
      ["t-3", "hold"],
      ["t-4", "done"],
      ["t-5", "pending"],
      ["t-6", "blocked"],
    ])
  })

  it("ID・題・依存・担当は課題の字のまま写す", () => {
    const [item] = taskSummaryItemsOfBeadsIssues([
      issue({
        id: "gh-12",
        status: "in_progress",
        title: "架空の題",
        blockedBy: ["gh-3", "t-a1b2"],
        assignee: "wt-a",
      }),
    ])

    expect(item).toEqual({
      id: "gh-12",
      summary: "架空の題",
      status: "doing",
      dependencies: ["gh-3", "t-a1b2"],
      waitingFor: [],
      assignee: "wt-a",
      body: "",
      location: { kind: "none" },
    })
  })

  it("作った時刻の順に並べ、同じ時刻なら ID の順にする", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-b", status: "open", createdAtEpochMilliseconds: 20 }),
      issue({ id: "t-c", status: "open", createdAtEpochMilliseconds: 10 }),
      issue({ id: "t-a", status: "open", createdAtEpochMilliseconds: 20 }),
    ])

    expect(items.map((item) => item.id)).toEqual(["t-c", "t-a", "t-b"])
  })

  it("閉じた課題は閉じた時刻の新しいものから10件だけ残す", () => {
    const closedIssues = Array.from({ length: 12 }, (_, index) =>
      issue({
        id: `t-${100 + index}`,
        status: "closed",
        createdAtEpochMilliseconds: index,
        closedAtEpochMilliseconds: index,
      }),
    )
    const items = taskSummaryItemsOfBeadsIssues(closedIssues)

    expect(items.map((item) => item.id)).toEqual([
      "t-102",
      "t-103",
      "t-104",
      "t-105",
      "t-106",
      "t-107",
      "t-108",
      "t-109",
      "t-110",
      "t-111",
    ])
  })

  it("external_ref が https:// の URL のときだけ置き場所にする", () => {
    const [withUrl, withoutUrl, notHttps] = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-1", status: "open", externalRef: "https://example.com/issues/1" }),
      issue({ id: "t-2", status: "open" }),
      issue({ id: "t-3", status: "open", externalRef: "example.com/issues/1" }),
    ])

    expect(withUrl?.location).toEqual({ kind: "issue", url: "https://example.com/issues/1" })
    expect(withoutUrl?.location).toEqual({ kind: "none" })
    expect(notHttps?.location).toEqual({ kind: "none" })
  })

  it("waitingFor には閉じていない課題の依存だけを依存の順で残し、閉じた・課題に無い依存は止めない", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-1", status: "closed", closedAtEpochMilliseconds: 1 }),
      issue({ id: "t-2", status: "open" }),
      issue({ id: "t-3", status: "deferred" }),
      issue({ id: "t-4", status: "open", blockedBy: ["t-3", "t-1", "t-900", "t-2"] }),
      issue({ id: "t-5", status: "closed", closedAtEpochMilliseconds: 2, blockedBy: ["t-2"] }),
    ])

    expect(items.map((item) => [item.id, item.waitingFor])).toEqual([
      ["t-1", []],
      ["t-2", []],
      ["t-3", []],
      ["t-4", ["t-3", "t-2"]],
      ["t-5", []],
    ])
  })
})

describe("taskSummaryItemsOfBeadsIssues の本文", () => {
  function bodyOf(fields: Partial<BeadsIssue>): string | undefined {
    return taskSummaryItemsOfBeadsIssues([issue({ id: "t-1", status: "open", ...fields })])[0]?.body
  }

  it("本文の欄がどれも空なら空文字列", () => {
    expect(bodyOf({})).toBe("")
  })

  it("description は見出しを付けずに置き、acceptance_criteria・notes を見出し付きでこの順に続ける", () => {
    expect(
      bodyOf({
        description: "\n## 架空の節\n\n架空の本文\n",
        acceptanceCriteria: "架空の条件\n",
        notes: "架空のメモ",
      }),
    ).toBe("## 架空の節\n\n架空の本文\n\n## 受け入れ条件\n\n架空の条件\n\n## メモ\n\n架空のメモ\n")
  })

  it("空の欄は見出しごと出さない", () => {
    expect(bodyOf({ notes: "架空のメモ" })).toBe("## メモ\n\n架空のメモ\n")
  })
})

describe("doneTasksOfBeadsIssues", () => {
  it("閉じた課題を閉じた時刻の順に拾い、閉じた時刻の無いものと閉じていないものは入れない", () => {
    const done = doneTasksOfBeadsIssues([
      issue({
        id: "t-1",
        status: "closed",
        createdAtEpochMilliseconds: 5,
        closedAtEpochMilliseconds: 1000,
      }),
      issue({ id: "t-2", status: "closed", closedAtEpochMilliseconds: 999 }),
      issue({ id: "t-3", status: "closed" }),
      issue({ id: "t-4", status: "in_progress" }),
    ])

    expect(done).toEqual([
      {
        id: "t-2",
        summary: "架空のt-2",
        createdAtEpochMilliseconds: 0,
        closedAtEpochMilliseconds: 999,
      },
      {
        id: "t-1",
        summary: "架空のt-1",
        createdAtEpochMilliseconds: 5,
        closedAtEpochMilliseconds: 1000,
      },
    ])
  })
})
