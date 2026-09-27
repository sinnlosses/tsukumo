import { describe, expect, it } from "vitest"

import {
  parseNewTaskFile,
  taskReadiness,
  unfinishedTaskIds,
  type TaskSummaryItem,
} from "../../../src/shared/repository/task-summary.ts"

// すべて手で書いた架空のタスク一覧。develop/task/ の実物は使わない。

describe("taskReadiness", () => {
  const item = (id: string, status: string, dependencies: readonly string[]): TaskSummaryItem => ({
    id,
    summary: `架空の${id}`,
    status,
    difficulty: undefined,
    loopable: undefined,
    dependencies,
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  })

  const FINISHED = item("X-001", "done", [])
  const FREE = item("X-002", "todo", [])
  const AFTER_FINISHED = item("X-003", "todo", ["X-001"])
  const AFTER_UNFINISHED = item("X-004", "todo", ["X-002", "X-001"])
  const AFTER_ARCHIVED = item("X-005", "todo", ["X-900"])
  const DROPPED = item("X-006", "dropped", [])
  const AFTER_DROPPED = item("X-007", "todo", ["X-006"])
  const TASKS: readonly TaskSummaryItem[] = [
    FINISHED,
    FREE,
    AFTER_FINISHED,
    AFTER_UNFINISHED,
    AFTER_ARCHIVED,
    DROPPED,
    AFTER_DROPPED,
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

  it("依存が dropped なら着手できる", () => {
    expect(taskReadiness(AFTER_DROPPED, UNFINISHED)).toEqual({ kind: "ready" })
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
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  })

  it("done・dropped でないタスクのIDだけを集める", () => {
    const tasks: readonly TaskSummaryItem[] = [
      item("X-001", "done"),
      item("X-002", "todo"),
      item("X-003", "doing"),
      item("X-004", "dropped"),
    ]

    expect(unfinishedTaskIds(tasks)).toEqual(new Set(["X-002", "X-003"]))
  })
})

// 新形式（develop/task/T-xxx.md の front matter）の読み取り。見本の正典は claude-skills の
// docs/task-workflow-redesign.md が正典（読み手ごとの実装が同じ表を写す決まり。Python 側は
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

  it("本文は front matter を閉じる2つ目の `---` の行より後ろだけになる", () => {
    const lines = [
      "---",
      "id: T-521",
      "summary: 架空のタスク",
      "status: todo",
      "difficulty: sonnet",
      "loopable: Y",
      "dependencies: []",
      "---",
      "本文の1行目",
    ]

    expect(parseNewTaskFile("T-521.md", lines.join("\n"))?.body).toBe("本文の1行目")
  })

  it("front matter だけで本文が無ければ空文字列", () => {
    const content = VALID_LINES.slice(0, 8).join("\n")

    expect(parseNewTaskFile("T-521.md", content)?.body).toBe("")
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

  it("dependencies に3桁と4桁の番号が並んでいても、その2件を読める", () => {
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

  it("ファイル名の語幹と id が食い違うときは INVALID", () => {
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
