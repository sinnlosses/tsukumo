import { describe, expect, it } from "vitest"

import {
  DEFAULT_RUN_PROMPT,
  projectSettingsOf,
  runPromptOf,
} from "../../../src/shared/repository/project-settings.ts"

describe("runPromptOf", () => {
  it("{id} をタスクIDに置き換える（何か所あってもすべて）", () => {
    expect(runPromptOf("/next-task {id}", "X-1", false)).toBe("/next-task X-1")
    expect(runPromptOf("/a {id} {id}", "X-1", false)).toBe("/a X-1 X-1")
  })

  it("既定の文面は平文で、保留のときだけ判断を聞く旨を添える", () => {
    expect(runPromptOf(DEFAULT_RUN_PROMPT, "X-1", false)).toBe(
      "タスク X-1 を進めて（bd show X-1 で読める）。",
    )
    expect(runPromptOf(DEFAULT_RUN_PROMPT, "X-1", true)).toBe(
      "タスク X-1 を進めて（bd show X-1 で読める）。このタスクは保留なので、着手の前に判断を聞いて。",
    )
    expect(runPromptOf("/next-task {id}", "X-1", true)).toBe("/next-task X-1")
  })
})

describe("projectSettingsOf", () => {
  it("tasks を読み、runPrompt を省けば既定の文面にする", () => {
    expect(projectSettingsOf('{ "tasks": { "mainBranch": "trunk" } }')).toEqual({
      kind: "read",
      tasks: { mainBranch: "trunk", runPrompt: DEFAULT_RUN_PROMPT },
    })
    expect(
      projectSettingsOf('{ "tasks": { "mainBranch": "main", "runPrompt": "/work {id}" } }'),
    ).toEqual({
      kind: "read",
      tasks: { mainBranch: "main", runPrompt: "/work {id}" },
    })
  })

  it('古い設定に残る "store": "beads" は読み捨てる', () => {
    expect(
      projectSettingsOf(
        '{ "tasks": { "store": "beads", "mainBranch": "main", "runPrompt": "/work {id}" } }',
      ),
    ).toEqual({
      kind: "read",
      tasks: { mainBranch: "main", runPrompt: "/work {id}" },
    })
  })

  it("tasks が無ければ設定なし", () => {
    expect(projectSettingsOf("{}")).toEqual({ kind: "none" })
  })

  it('tasks が "off" ならタスク運用を使わない', () => {
    expect(projectSettingsOf('{ "tasks": "off" }')).toEqual({ kind: "off" })
  })

  it.each([
    ["壊れた JSON", '{ "tasks": '],
    ["オブジェクトでない", "[]"],
    ["Beads でない置き場", '{ "tasks": { "store": "files", "mainBranch": "main" } }'],
    ['"off" 以外の文字列', '{ "tasks": "on" }'],
    ["主ブランチが無い", '{ "tasks": { "runPrompt": "/work {id}" } }'],
    ["主ブランチが空", '{ "tasks": { "mainBranch": "" } }'],
    ["tasks の中の知らない鍵", '{ "tasks": { "mainBranch": "main", "x": 1 } }'],
    ["最上位の知らない鍵", '{ "task": { "mainBranch": "main" } }'],
  ])("%s は読めない（既定へ倒さない）", (_, content) => {
    expect(projectSettingsOf(content)).toEqual({ kind: "invalid" })
  })
})
