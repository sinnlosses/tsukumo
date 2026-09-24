import { describe, expect, it } from "bun:test"

import {
  countAchievementCommits,
  doneTasksSince,
  doneTaskSummaries,
  hasTaskTracking,
  type AchievementCommit,
  type TaskSnapshotSource,
} from "../../../src/server/core/achievement.ts"

// ここで使うコミット・タスクはすべて手で書いた架空のもの（実物のリポジトリの履歴は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

const EMPTY_SOURCE: TaskSnapshotSource = {
  newFormatFiles: [],
  oldTasksJson: undefined,
  archiveMarkdown: undefined,
}

function commit(
  hash: string,
  committedAtEpochSeconds: number,
  changedFiles: readonly string[],
): AchievementCommit {
  return { hash, committedAtEpochSeconds, changedFiles }
}

describe("countAchievementCommits", () => {
  it("範囲 [start, end) に入るコミットだけを数える（終わりは含まない）", () => {
    const commits = [
      commit("a", 100, ["src/a.ts"]),
      commit("b", 199, ["src/b.ts"]),
      commit("c", 200, ["src/c.ts"]), // end と同じ時刻は含まない
      commit("d", 99, ["src/d.ts"]), // start より前
    ]

    expect(countAchievementCommits(commits, 100, 200)).toBe(2)
  })

  it("運用の帳面だけを触ったコミットは外す", () => {
    const commits = [
      commit("a", 100, ["develop/tasks.json"]),
      commit("b", 100, ["develop/progress.md"]),
      commit("c", 100, ["develop/task/T-001.md"]),
      commit("d", 100, ["docs/history/tasks.md"]),
      commit("e", 100, ["docs/history/progress.md"]),
      commit("f", 100, ["src/a.ts"]),
    ]

    expect(countAchievementCommits(commits, 0, 200)).toBe(1)
  })

  it("仕事のファイルと帳面を両方触ったコミットは数える", () => {
    const commits = [commit("a", 100, ["develop/tasks.json", "src/a.ts"])]

    expect(countAchievementCommits(commits, 0, 200)).toBe(1)
  })

  it("変更ファイルが0件（空コミット）は数えない", () => {
    const commits = [commit("a", 100, [])]

    expect(countAchievementCommits(commits, 0, 200)).toBe(0)
  })
})

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
