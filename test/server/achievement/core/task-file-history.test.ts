import { describe, expect, it } from "vitest"

import {
  deletedDoneTaskSummariesBefore,
  graduationsOf,
  taskFileIdOfPath,
  taskRegistrationDates,
  type DeletedTaskFile,
  type TaskFileHistoryCommit,
} from "../../../../src/server/achievement/core/task-file-history.ts"

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

describe("taskFileIdOfPath", () => {
  it("develop/task/T-xxx.md から ID を取る", () => {
    expect(taskFileIdOfPath("develop/task/T-561.md")).toBe("T-561")
  })

  it("当てはまらないパスは undefined", () => {
    expect(taskFileIdOfPath("develop/tasks.json")).toBeUndefined()
    expect(taskFileIdOfPath("docs/history/tasks.md")).toBeUndefined()
  })
})

function historyCommit(
  localDateKey: string,
  changes: readonly { status: string; path: string }[],
  committedAtEpochSeconds = 0,
): TaskFileHistoryCommit {
  return { committedAtEpochSeconds, localDateKey, changes }
}

describe("taskRegistrationDates", () => {
  it("最古の A のコミットの日付を登録日にする", () => {
    const commits = [
      historyCommit("2026-09-20", [{ status: "A", path: "develop/task/T-001.md" }]),
      historyCommit("2026-09-22", [{ status: "M", path: "develop/task/T-001.md" }]),
    ]

    expect([...taskRegistrationDates(commits, new Map())]).toEqual([["T-001", "2026-09-20"]])
  })

  it("develop/tasks.json の D を含むコミットで入ったファイルは登録日の表に入れない（形式の切り替え）", () => {
    const commits = [
      historyCommit("2026-09-23", [
        { status: "D", path: "develop/tasks.json" },
        { status: "A", path: "develop/task/T-001.md" },
      ]),
    ]

    expect([...taskRegistrationDates(commits, new Map())]).toEqual([])
  })

  it("同じコミットでも develop/tasks.json の D が無ければ登録日に入れる", () => {
    const commits = [historyCommit("2026-09-23", [{ status: "A", path: "develop/task/T-001.md" }])]

    expect([...taskRegistrationDates(commits, new Map())]).toEqual([["T-001", "2026-09-23"]])
  })

  it("Beads の作った日は、git のタスクファイルに一度も現れなかった ID にだけ使う（移した課題の作った日は登録日でない）", () => {
    const commits = [
      historyCommit("2026-09-10", [{ status: "A", path: "develop/task/T-001.md" }]),
      historyCommit("2026-09-23", [
        { status: "D", path: "develop/tasks.json" },
        { status: "A", path: "develop/task/T-002.md" },
      ]),
    ]
    const beadsCreatedOn = new Map([
      ["T-001", "2026-09-27"],
      ["T-002", "2026-09-27"],
      ["T-003", "2026-09-28"],
    ])

    expect(new Map(taskRegistrationDates(commits, beadsCreatedOn))).toEqual(
      new Map([
        ["T-001", "2026-09-10"],
        ["T-003", "2026-09-28"],
      ]),
    )
  })
})

function deletedTaskFile(
  id: string,
  committedAtEpochSeconds: number,
  content: string | undefined,
): DeletedTaskFile {
  return { id, committedAtEpochSeconds, content }
}

describe("deletedDoneTaskSummariesBefore", () => {
  it("指定した時刻より前に消え、消える直前が done のものだけ拾う", () => {
    const files = [
      deletedTaskFile("T-001", 100, newTaskFile("T-001", "剪定された完了", "done").content),
      deletedTaskFile("T-002", 100, newTaskFile("T-002", "剪定されたが未完了", "todo").content),
      deletedTaskFile("T-003", 200, newTaskFile("T-003", "範囲の外", "done").content), // beforeEpochSeconds と同時刻は含まない
    ]

    expect([...deletedDoneTaskSummariesBefore(files, 200)]).toEqual([["T-001", "剪定された完了"]])
  })

  it("消える直前の版が読めなかった（content が undefined）ものは飛ばす", () => {
    const files = [deletedTaskFile("T-001", 100, undefined)]

    expect([...deletedDoneTaskSummariesBefore(files, 200)]).toEqual([])
  })
})

describe("graduationsOf", () => {
  it("登録から7日以上のものだけを、登録の古い順で返す", () => {
    const items = [
      { id: "T-001", summary: "7日ちょうど" },
      { id: "T-002", summary: "6日（まだ）" },
      { id: "T-003", summary: "登録日が無い" },
    ]
    const registeredOnById = new Map([
      ["T-001", "2026-09-16"],
      ["T-002", "2026-09-17"],
    ])

    expect(graduationsOf(items, registeredOnById, "2026-09-23")).toEqual([
      { id: "T-001", summary: "7日ちょうど", registeredOn: "2026-09-16", days: 7 },
    ])
  })

  it("複数の卒業は登録の古い順に並べる", () => {
    const items = [
      { id: "T-001", summary: "新しく登録した方" },
      { id: "T-002", summary: "長く待っていた方" },
    ]
    const registeredOnById = new Map([
      ["T-001", "2026-09-10"],
      ["T-002", "2026-09-01"],
    ])

    expect(graduationsOf(items, registeredOnById, "2026-09-23").map((g) => g.id)).toEqual([
      "T-002",
      "T-001",
    ])
  })
})
