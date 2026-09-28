import { describe, expect, it } from "vitest"

import {
  closedBeadsTaskSummariesBefore,
  composeBeadsBody,
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
    description: "",
    acceptanceCriteria: "",
    notes: "",
    externalRef: undefined,
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

  it("組み込みの deferred も pending と同じく hold に読み替える", () => {
    const items = taskSummaryItemsOfBeadsIssues([issue({ id: "gh-6", status: "deferred" })])

    expect(items.map((item) => [item.id, item.status])).toEqual([["GH-6", "hold"]])
  })

  it("gh-<n> の課題は GH-<n> として出し、t-<n> と混ざっても番号順に並ぶ", () => {
    const items = taskSummaryItemsOfBeadsIssues([
      issue({ id: "gh-20", status: "open" }),
      issue({ id: "t-005", status: "open" }),
      issue({ id: "gh-3", status: "open" }),
    ])

    expect(items.map((item) => item.id)).toEqual(["GH-3", "T-005", "GH-20"])
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
      body: composeBeadsBody("", "", ""),
      location: { kind: "none" },
    })
  })

  it("external_ref が https:// の URL のときだけ置き場所にする", () => {
    const [withUrl, withoutUrl, notHttps] = taskSummaryItemsOfBeadsIssues([
      issue({ id: "t-020", status: "open", externalRef: "https://example.com/issues/1" }),
      issue({ id: "t-021", status: "open" }),
      issue({ id: "t-022", status: "open", externalRef: "example.com/issues/1" }),
    ])

    expect(withUrl?.location).toEqual({ kind: "issue", url: "https://example.com/issues/1" })
    expect(withoutUrl?.location).toEqual({ kind: "none" })
    expect(notHttps?.location).toEqual({ kind: "none" })
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
  it("t- の番号は T- に、gh- の番号は GH- に直し、番号でない ID はそのまま", () => {
    expect(taskIdOfBeadsId("t-123")).toBe("T-123")
    expect(taskIdOfBeadsId("t-a3f2")).toBe("t-a3f2")
    expect(taskIdOfBeadsId("gh-5")).toBe("GH-5")
    expect(taskIdOfBeadsId("gh-1234-1-a3f2")).toBe("gh-1234-1-a3f2")
  })
})

// タスクファイルの枠の7節（`docs/architecture/display.md`「タスクのモーダル」が指す `taskfile.SECTION_HEADINGS`）。
// `task show` と同じ順にこの7つを必ず出す（中身が空でも見出しだけ）。
const FRAME_HEADINGS = [
  "## 目的・背景",
  "## 決まっていること（蒸し返さない）",
  "## 解くべき論点",
  "## やること",
  "## 完了条件",
  "## 注意",
  "## 参考情報",
] as const

/** 枠の7節に `overrides` の中身を差し込んだ期待値。`extra` は枠の外の見出しを後ろに付ける。 */
function expectedBody(
  overrides: Partial<Record<(typeof FRAME_HEADINGS)[number], string>>,
  extra: readonly string[] = [],
): string {
  const framed = FRAME_HEADINGS.map((heading) => {
    const content = overrides[heading]
    return content === undefined || content === "" ? heading : `${heading}\n\n${content}`
  })
  return `${[...framed, ...extra].join("\n\n")}\n`
}

describe("composeBeadsBody（task show と同じ並びに組む）", () => {
  it("description・acceptance_criteria・notes がどれも無ければ、枠の7節だけの骨組みになる", () => {
    expect(composeBeadsBody("", "", "")).toBe(expectedBody({}))
  })

  it("description だけあれば、対応する節にだけ中身が入る", () => {
    const description = "## 目的・背景\n\n本文一行目\n"

    expect(composeBeadsBody(description, "", "")).toBe(
      expectedBody({ "## 目的・背景": "本文一行目" }),
    )
  })

  it("acceptance_criteria（完了条件）だけあれば、その節にだけ中身が入る", () => {
    expect(composeBeadsBody("", "完了条件の中身", "")).toBe(
      expectedBody({ "## 完了条件": "完了条件の中身" }),
    )
  })

  it("notes（やること）が空でも、ほかの節の中身はそのまま出る", () => {
    const description = "## 目的・背景\n\n目的\n"

    expect(composeBeadsBody(description, "完了条件", "")).toBe(
      expectedBody({ "## 目的・背景": "目的", "## 完了条件": "完了条件" }),
    )
  })

  it("枠の外の見出しは、枠の7節のあとにそのまま付く", () => {
    const description = "## 目的・背景\n\n目的\n\n## 独自メモ\n\nメモ本文\n"

    expect(composeBeadsBody(description, "", "")).toBe(
      expectedBody({ "## 目的・背景": "目的" }, ["## 独自メモ\n\nメモ本文"]),
    )
  })
})
