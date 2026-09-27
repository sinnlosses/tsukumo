import { describe, expect, it } from "vitest"

import {
  closedBeadsTaskSummariesBefore,
  taskIdOfBeadsId,
  taskSummaryItemsOfBeadsIssues,
  type BeadsIssue,
} from "../../../src/shared/repository/beads-issue.ts"

// すべて手で書いた架空の課題。`bd` の実データは使わない。

function issue(overrides: Partial<BeadsIssue> & Pick<BeadsIssue, "id" | "status">): BeadsIssue {
  return {
    title: `架空の${overrides.id}`,
    labels: [],
    blockedBy: [],
    assignee: undefined,
    createdAtEpochMilliseconds: 0,
    closedAtEpochMilliseconds: undefined,
    ...overrides,
  }
}

describe("taskSummaryItemsOfBeadsIssues", () => {
  it("open・pending・in_progress を todo・hold・doing に読み替え、閉じた課題は done で出す", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-001", status: "open" }),
      issue({ id: "t-002", status: "pending" }),
      issue({ id: "t-003", status: "in_progress", assignee: "wt-a" }),
      issue({ id: "t-004", status: "closed", closedAtEpochMilliseconds: 1 }),
      issue({ id: "t-005", status: "blocked" }),
    ])

    expect(items.map((item) => [item.id, item.status, item.assignee])).toEqual([
      ["T-001", "todo", undefined],
      ["T-002", "hold", undefined],
      ["T-003", "doing", "wt-a"],
      ["T-004", "done", undefined],
      ["T-005", "blocked", undefined],
    ])
  })

  it("label cancelled の閉じた課題は dropped で出す", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({
        id: "t-006",
        status: "closed",
        closedAtEpochMilliseconds: 1,
        labels: ["cancelled"],
      }),
    ])

    expect(items.map((item) => item.status)).toEqual(["dropped"])
  })

  it("閉じた課題は closedAtEpochMilliseconds の新しい順に10件だけ出す", () => {
    const closedIssues = Array.from({ length: 12 }, (_, index) =>
      issue({
        id: `t-${100 + index}`,
        status: "closed",
        closedAtEpochMilliseconds: index,
      }),
    )
    const items = taskSummaryItemsOfBeadsIssues(closedIssues)

    expect(items.map((item) => item.id)).toEqual([
      "T-102",
      "T-103",
      "T-104",
      "T-105",
      "T-106",
      "T-107",
      "T-108",
      "T-109",
      "T-110",
      "T-111",
    ])
  })

  it("difficulty・loopable は label から読み、依存は blocks の依存先をタスクIDにする", () => {
    const [item] = taskSummaryItemsOfBeadsIssues([
      issue({
        id: "t-010",
        status: "open",
        labels: ["loopable:N", "difficulty:opus", "ship:done"],
        blockedBy: ["t-002", "t-a1b2"],
      }),
    ])

    expect(item).toEqual({
      id: "T-010",
      summary: "架空のt-010",
      status: "todo",
      difficulty: "opus",
      loopable: "N",
      dependencies: ["T-002", "t-a1b2"],
      assignee: undefined,
    })
  })

  it("番号の順に並べ、番号でない ID は後ろに ID の順で付ける", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-zz9", status: "open" }),
      issue({ id: "t-1000", status: "open" }),
      issue({ id: "t-a1b2", status: "open" }),
      issue({ id: "t-020", status: "open" }),
    ])

    expect(items.map((item) => item.id)).toEqual(["T-020", "T-1000", "t-a1b2", "t-zz9"])
  })
})

describe("closedBeadsTaskSummariesBefore", () => {
  it("その時刻より前に閉じた課題だけを拾い、label cancelled（dropped）は数えない", () => {
    const summaries = closedBeadsTaskSummariesBefore(
      [
        issue({ id: "t-001", status: "closed", closedAtEpochMilliseconds: 999 }),
        issue({ id: "t-002", status: "closed", closedAtEpochMilliseconds: 1000 }),
        issue({
          id: "t-003",
          status: "closed",
          closedAtEpochMilliseconds: 10,
          labels: ["cancelled"],
        }),
        issue({ id: "t-004", status: "in_progress" }),
      ],
      1000,
    )

    expect([...summaries]).toEqual([["T-001", "架空のt-001"]])
  })
})

describe("taskIdOfBeadsId", () => {
  it("番号の ID だけ T- に直し、番号でない ID はそのまま", () => {
    expect(taskIdOfBeadsId("t-123")).toBe("T-123")
    expect(taskIdOfBeadsId("t-a3f2")).toBe("t-a3f2")
  })
})
