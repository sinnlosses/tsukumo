import { describe, expect, it } from "vitest"

import { projectSettingsOf, runPromptOf } from "../../../src/shared/repository/project-settings.ts"

describe("runPromptOf", () => {
  it("{id} をタスクIDに置き換える（何か所あってもすべて）", () => {
    expect(runPromptOf("/next-task {id}", "X-1")).toBe("/next-task X-1")
    expect(runPromptOf("/a {id} {id}", "X-1")).toBe("/a X-1 X-1")
  })
})

describe("projectSettingsOf", () => {
  it("tasks を読み、runPrompt を省けば既定の文面にする", () => {
    expect(projectSettingsOf('{ "tasks": { "mainBranch": "trunk" } }')).toEqual({
      kind: "read",
      tasks: { mainBranch: "trunk", runPrompt: "/next-task {id}" },
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

  it.each([
    ["壊れた JSON", '{ "tasks": '],
    ["オブジェクトでない", "[]"],
    ["Beads でない置き場", '{ "tasks": { "store": "files", "mainBranch": "main" } }'],
    ["主ブランチが無い", '{ "tasks": { "runPrompt": "/work {id}" } }'],
    ["主ブランチが空", '{ "tasks": { "mainBranch": "" } }'],
    ["tasks の中の知らない鍵", '{ "tasks": { "mainBranch": "main", "x": 1 } }'],
    ["最上位の知らない鍵", '{ "task": { "mainBranch": "main" } }'],
  ])("%s は読めない（既定へ倒さない）", (_, content) => {
    expect(projectSettingsOf(content)).toEqual({ kind: "invalid" })
  })
})
