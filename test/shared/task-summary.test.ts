import { describe, expect, it } from "bun:test"

import {
  newFormatTaskSummaries,
  parseNewTaskFile,
  taskReadiness,
  unfinishedTaskIds,
  type TaskSummaryItem,
} from "../../src/shared/task-summary.ts"

// すべて手で書いた架空のタスク一覧。develop/task/ の実物は使わない。

describe("taskReadiness", () => {
  const item = (id: string, status: string, dependencies: readonly string[]): TaskSummaryItem => ({
    id,
    summary: `架空の${id}`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies,
  })

  const FINISHED = item("X-001", "done", [])
  const FREE = item("X-002", "todo", [])
  const AFTER_FINISHED = item("X-003", "todo", ["X-001"])
  const AFTER_UNFINISHED = item("X-004", "todo", ["X-002", "X-001"])
  const AFTER_ARCHIVED = item("X-005", "todo", ["X-900"])
  const TASKS: readonly TaskSummaryItem[] = [
    FINISHED,
    FREE,
    AFTER_FINISHED,
    AFTER_UNFINISHED,
    AFTER_ARCHIVED,
  ]
  const UNFINISHED = unfinishedTaskIds(TASKS)

  it("todo 以外は判定しない", () => {
    expect(taskReadiness(FINISHED, UNFINISHED)).toBeUndefined()
  })

  it("依存が無ければ着手できる", () => {
    expect(taskReadiness(FREE, UNFINISHED)).toEqual({ kind: "ready" })
  })

  it("依存が done なら着手できる", () => {
    expect(taskReadiness(AFTER_FINISHED, UNFINISHED)).toEqual({ kind: "ready" })
  })

  it("done でない依存があると、その ID を並べて止める", () => {
    expect(taskReadiness(AFTER_UNFINISHED, UNFINISHED)).toEqual({
      kind: "blocked",
      blockedBy: ["X-002"],
    })
  })

  it("一覧に無い依存は止めない（アーカイブ済みは完了扱い）", () => {
    expect(taskReadiness(AFTER_ARCHIVED, UNFINISHED)).toEqual({ kind: "ready" })
  })
})

describe("unfinishedTaskIds", () => {
  const item = (id: string, status: string): TaskSummaryItem => ({
    id,
    summary: `架空の${id}`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies: [],
  })

  it("done でないタスクのIDだけを集める", () => {
    const tasks: readonly TaskSummaryItem[] = [
      item("X-001", "done"),
      item("X-002", "todo"),
      item("X-003", "doing"),
    ]

    expect(unfinishedTaskIds(tasks)).toEqual(new Set(["X-002", "X-003"]))
  })
})

// 新形式（develop/task/T-xxx.md の front matter）の読み取り。見本の正典は claude-skills の
// docs/task-workflow-redesign.md 3.4（読み手ごとの実装が同じ表を写す決まり。Python 側は
// skills/task-workflow/scripts/selftest_task.py）。行の位置で判定するので、他の行は既定で有効な
// ままにして、表の対象の行だけを差し替える。
describe("parseNewTaskFile（3.4 の読み取りの見本）", () => {
  const VALID_LINES = [
    "---",
    "id: T-521",
    "summary: 架空のタスク",
    "status: todo",
    "difficulty: sonnet",
    "loopable: Y",
    "dependencies: []",
    "---",
    "",
    "## 目的",
    "",
    "架空の本文。",
    "",
  ]

  /** `VALID_LINES` のうち1行だけ差し替えて front matter を組み立てる。 */
  function contentOf(overrides: Readonly<Record<number, string>>): string {
    return VALID_LINES.map((line, index) => overrides[index] ?? line).join("\n")
  }

  it("6行そろっていれば読める（他の行が INVALID を作らないことの確認）", () => {
    expect(parseNewTaskFile("T-521.md", contentOf({}))).toEqual({
      id: "T-521",
      summary: "架空のタスク",
      status: "todo",
      difficulty: "sonnet",
      loopable: "Y",
      dependencies: [],
    })
  })

  it("summary は前後の空白を落とし、中身はそのまま（`` ` `` 始まり・`:` ・`#` ・`[` を含んでも）", () => {
    const content = contentOf({ 2: "summary: `a: b` # c [d]" })

    expect(parseNewTaskFile("T-521.md", content)?.summary).toBe("`a: b` # c [d]")
  })

  it("summary の前後の空白は落とす", () => {
    const content = contentOf({ 2: "summary:   前後に空白   " })

    expect(parseNewTaskFile("T-521.md", content)?.summary).toBe("前後に空白")
  })

  it("dependencies: [] は依存なし", () => {
    const content = contentOf({ 6: "dependencies: []" })

    expect(parseNewTaskFile("T-521.md", content)?.dependencies).toEqual([])
  })

  it("dependencies: [T-001, T-1000] はその2件（3桁未満・4桁のどちらも読める）", () => {
    const content = contentOf({ 6: "dependencies: [T-001, T-1000]" })

    expect(parseNewTaskFile("T-521.md", content)?.dependencies).toEqual(["T-001", "T-1000"])
  })

  it("dependencies の区切りが ', ' 固定でない（カンマだけ）ときは INVALID", () => {
    const content = contentOf({ 6: "dependencies: [T-001,T-002]" })

    expect(parseNewTaskFile("T-521.md", content)).toBeUndefined()
  })

  it("loopable が小文字の y のときは INVALID（Y/N だけ）", () => {
    const content = contentOf({ 4: "loopable: y" })

    expect(parseNewTaskFile("T-521.md", content)).toBeUndefined()
  })

  it("status: doing は INVALID（着手中はファイルに書かない）", () => {
    const content = contentOf({ 3: "status: doing" })

    expect(parseNewTaskFile("T-521.md", content)).toBeUndefined()
  })

  it("キーが5行しか無いときは INVALID", () => {
    const lines = VALID_LINES.filter((_, index) => index !== 6)
    expect(parseNewTaskFile("T-521.md", lines.join("\n"))).toBeUndefined()
  })

  it("owner: x のような知らないキーが混ざるときは INVALID", () => {
    const content = contentOf({ 6: "owner: x" })

    expect(parseNewTaskFile("T-521.md", content)).toBeUndefined()
  })

  it("summary と status の行の順が逆のときは INVALID", () => {
    const content = contentOf({ 2: "status: todo", 3: "summary: 架空のタスク" })

    expect(parseNewTaskFile("T-521.md", content)).toBeUndefined()
  })

  it("ファイル名 T-010.md で id: T-011 のときは INVALID（ファイル名の語幹と id の不一致）", () => {
    const content = contentOf({ 1: "id: T-011" })

    expect(parseNewTaskFile("T-010.md", content)).toBeUndefined()
  })

  it("1行目が --- でないときは INVALID", () => {
    const content = contentOf({ 0: "id: T-521" })

    expect(parseNewTaskFile("T-521.md", content)).toBeUndefined()
  })

  it("CRLF を含むときは INVALID", () => {
    expect(parseNewTaskFile("T-521.md", contentOf({}).replaceAll("\n", "\r\n"))).toBeUndefined()
  })
})

describe("newFormatTaskSummaries", () => {
  function taskFileContent(id: string, status: string): string {
    return [
      "---",
      `id: ${id}`,
      `summary: 架空の${id}`,
      `status: ${status}`,
      "difficulty: sonnet",
      "loopable: Y",
      "dependencies: []",
      "---",
      "",
    ].join("\n")
  }

  it("台帳に印がある todo は status を doing に読み替える", () => {
    const files = [
      { name: "T-002.md", content: taskFileContent("T-002", "todo") },
      { name: "T-001.md", content: taskFileContent("T-001", "todo") },
    ]

    const items = newFormatTaskSummaries(files, new Set(["T-001"]))

    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["T-001", "doing"],
      ["T-002", "todo"],
    ])
  })

  it("台帳の印は todo 以外には効かない（done はそのまま）", () => {
    const files = [{ name: "T-001.md", content: taskFileContent("T-001", "done") }]

    const items = newFormatTaskSummaries(files, new Set(["T-001"]))

    expect(items[0]?.status).toBe("done")
  })

  it("並びは ID の数字順（ファイルの順ではない）", () => {
    const files = [
      { name: "T-1000.md", content: taskFileContent("T-1000", "todo") },
      { name: "T-002.md", content: taskFileContent("T-002", "todo") },
      { name: "T-030.md", content: taskFileContent("T-030", "todo") },
    ]

    expect(newFormatTaskSummaries(files, new Set()).map((item) => item.id)).toEqual([
      "T-002",
      "T-030",
      "T-1000",
    ])
  })

  it("INVALID なファイルはその1件だけ読み飛ばす", () => {
    const files = [
      { name: "T-001.md", content: taskFileContent("T-001", "todo") },
      { name: "T-002.md", content: "---\nid: T-002\n壊れている" },
    ]

    expect(newFormatTaskSummaries(files, new Set()).map((item) => item.id)).toEqual(["T-001"])
  })
})
