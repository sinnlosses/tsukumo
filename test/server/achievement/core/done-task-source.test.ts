import { describe, expect, it } from "vitest"

import {
  doneTasksSince,
  doneTaskSummaries,
  hasTaskTracking,
  taskMilestoneOf,
  unionDoneTaskSummaries,
  type TaskSnapshotSource,
} from "../../../../src/server/achievement/core/done-task-source.ts"

const EMPTY_SOURCE: TaskSnapshotSource = {
  newFormatFiles: [],
  oldTasksJson: undefined,
  archiveMarkdown: undefined,
}

describe("hasTaskTracking", () => {
  it("読み元がどれも無ければ false", () => {
    expect(hasTaskTracking(EMPTY_SOURCE)).toBe(false)
  })

  it("新形式のファイルが1件でもあれば true", () => {
    expect(
      hasTaskTracking({
        ...EMPTY_SOURCE,
        newFormatFiles: [{ name: "T-001.md", content: "架空" }],
      }),
    ).toBe(true)
  })

  it("旧形式の tasks.json があれば true（内容が空配列でも）", () => {
    expect(hasTaskTracking({ ...EMPTY_SOURCE, oldTasksJson: "[]" })).toBe(true)
  })

  it("アーカイブがあれば true", () => {
    expect(hasTaskTracking({ ...EMPTY_SOURCE, archiveMarkdown: "# 完了タスクのアーカイブ" })).toBe(
      true,
    )
  })
})

function newTaskFile(
  id: string,
  summary: string,
  status: string,
): { name: string; content: string } {
  return {
    name: `${id}.md`,
    content: [
      "---",
      `id: ${id}`,
      `summary: ${summary}`,
      `status: ${status}`,
      "difficulty: sonnet",
      "loopable: Y",
      "dependencies: []",
      "---",
      "",
    ].join("\n"),
  }
}

function oldTask(
  id: string,
  summary: string,
  status: string,
  passes: boolean | undefined,
): Record<string, unknown> {
  return passes === undefined ? { id, summary, status } : { id, summary, status, passes }
}

describe("doneTaskSummaries", () => {
  it("新形式の done だけを拾う（todo などは拾わない）", () => {
    const source: TaskSnapshotSource = {
      ...EMPTY_SOURCE,
      newFormatFiles: [
        newTaskFile("T-001", "終わった", "done"),
        newTaskFile("T-002", "まだ", "todo"),
      ],
    }

    expect([...doneTaskSummaries(source)]).toEqual([["T-001", "終わった"]])
  })

  it("旧形式は status: done かつ passes: true だけを拾う", () => {
    const source: TaskSnapshotSource = {
      ...EMPTY_SOURCE,
      oldTasksJson: JSON.stringify([
        oldTask("T-010", "合格", "done", true),
        oldTask("T-011", "却下", "done", false), // dropped 相当。数えない
        oldTask("T-012", "未着手", "todo", undefined),
      ]),
    }

    expect([...doneTaskSummaries(source)]).toEqual([["T-010", "合格"]])
  })

  it("旧形式の summary が空なら task の先頭行で代用する", () => {
    const source: TaskSnapshotSource = {
      ...EMPTY_SOURCE,
      oldTasksJson: JSON.stringify([
        { id: "T-020", summary: "", status: "done", passes: true, task: "先頭行\n本文" },
      ]),
    }

    expect([...doneTaskSummaries(source)]).toEqual([["T-020", "先頭行"]])
  })

  it("アーカイブは passes が true/yes（大文字小文字・バックティックの揺れを含む）の節だけ拾う", () => {
    const archiveMarkdown = [
      "## T-100 見出しに名前がある節",
      "",
      "- **difficulty**: `opus` / **passes**: `true` / **dependencies**: なし",
      "",
      "## T-101 却下された節",
      "",
      "- **difficulty**: `opus` / **passes**: `false` / **dependencies**: なし",
      "",
      "## T-102",
      "",
      "**タスク**: 見出しに名前が無い古い節",
      "",
      "**difficulty**: sonnet / **loopable**: Y / **dependencies**: なし / **passes**: True",
      "",
      "## T-103",
      "",
      "**タスク**: yes 表記の古い節",
      "",
      "**difficulty**: sonnet / **loopable**: Y / **dependencies**: なし / **passes**: yes",
    ].join("\n")

    const items = [...doneTaskSummaries({ ...EMPTY_SOURCE, archiveMarkdown })].sort()

    expect(items).toEqual([
      ["T-100", "見出しに名前がある節"],
      ["T-102", "見出しに名前が無い古い節"],
      ["T-103", "yes 表記の古い節"],
    ])
  })

  it("優先順は新形式 → 旧形式 → アーカイブ（同じ ID が複数の読み元にあれば先に見つかったものを残す）", () => {
    const source: TaskSnapshotSource = {
      newFormatFiles: [newTaskFile("T-001", "新形式の要約", "done")],
      oldTasksJson: JSON.stringify([oldTask("T-001", "旧形式の要約", "done", true)]),
      archiveMarkdown: ["## T-001 アーカイブの要約", "", "- **passes**: `true`"].join("\n"),
    }

    expect([...doneTaskSummaries(source)]).toEqual([["T-001", "新形式の要約"]])
  })

  it("読み元がどれも無ければ空（「数えられない」の判定は hasTaskTracking が別に持つ）", () => {
    expect([...doneTaskSummaries(EMPTY_SOURCE)]).toEqual([])
  })
})

describe("doneTasksSince", () => {
  it("前の日には無かった ID だけを返す", () => {
    const today = new Map([
      ["T-001", "既に終わっていた"],
      ["T-002", "今日終わった"],
    ])
    const yesterday = new Map([["T-001", "既に終わっていた"]])

    expect(doneTasksSince(today, yesterday)).toEqual([{ id: "T-002", summary: "今日終わった" }])
  })

  it("前の日が空集合なら全件が差分になる（リポジトリの最初の日）", () => {
    const today = new Map([["T-001", "最初の完了"]])

    expect(doneTasksSince(today, new Map())).toEqual([{ id: "T-001", summary: "最初の完了" }])
  })

  it("差分が無ければ空の並び", () => {
    const today = new Map([["T-001", "同じ"]])
    const yesterday = new Map([["T-001", "同じ"]])

    expect(doneTasksSince(today, yesterday)).toEqual([])
  })
})

describe("unionDoneTaskSummaries", () => {
  it("2つの読み元を足し合わせる", () => {
    const a = new Map([["T-001", "aの要約"]])
    const b = new Map([["T-002", "bの要約"]])

    expect([...unionDoneTaskSummaries(a, b)].sort()).toEqual([
      ["T-001", "aの要約"],
      ["T-002", "bの要約"],
    ])
  })

  it("同じ ID があれば a を残す", () => {
    const a = new Map([["T-001", "aの要約"]])
    const b = new Map([["T-001", "bの要約"]])

    expect([...unionDoneTaskSummaries(a, b)]).toEqual([["T-001", "aの要約"]])
  })
})

describe("taskMilestoneOf", () => {
  it("ID の順に足していって刻みに届いたタスクを返す", () => {
    const items = [
      { id: "T-102", summary: "b" },
      { id: "T-101", summary: "a" },
    ]

    expect(taskMilestoneOf(items, 248)).toEqual({ kind: "task", count: 250, taskId: "T-102" })
  })

  it("刻みに届かなければ undefined", () => {
    const items = [{ id: "T-001", summary: "a" }]

    expect(taskMilestoneOf(items, 100)).toBeUndefined()
  })

  it("GH-<n> の ID も番号順に足す（T-xxx と混ざっても数で並ぶ）", () => {
    const items = [
      { id: "GH-102", summary: "b" },
      { id: "T-101", summary: "a" },
    ]

    expect(taskMilestoneOf(items, 248)).toEqual({ kind: "task", count: 250, taskId: "GH-102" })
  })

  it("1日に複数の刻みをまたいだら、最後にまたいだものだけ返す", () => {
    // 250件ぶんの刻みを2回またぐには、少なくとも250件超のタスクが同じ日に終わる必要がある
    // （現実的には稀だが、ロジックが「あとから見つかったほうを残す」ことを確かめる）。
    const items = Array.from({ length: 260 }, (_, index) => ({
      id: `T-${String(index + 1).padStart(3, "0")}`,
      summary: "x",
    }))

    expect(taskMilestoneOf(items, 248)).toEqual({ kind: "task", count: 500, taskId: "T-252" })
  })
})
