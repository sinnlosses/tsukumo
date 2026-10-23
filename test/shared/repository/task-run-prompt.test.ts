import { describe, expect, it } from "vitest"

import { requestPromptOf } from "../../../src/shared/repository/task-run-prompt.ts"

const FIXED = "タスク ABC-1 を進めて（bd show ABC-1 で読める）。"
const HELD_NOTE = "このタスクは保留なので、着手の前に判断を聞いて。"

describe("requestPromptOf の start", () => {
  it("起動スキルが空・未指定なら固定の文面で、保留の旨は末尾に続く", () => {
    expect(requestPromptOf("ABC-1", { kind: "start", held: false })).toBe(FIXED)
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "")).toBe(FIXED)
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "  /  ")).toBe(FIXED)
    expect(requestPromptOf("ABC-1", { kind: "start", held: true }, "")).toBe(`${FIXED}${HELD_NOTE}`)
  })

  it("起動スキルがあれば「/スキル名 ID」にし、保留なら末尾に旨を添える", () => {
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "next-task")).toBe(
      "/next-task ABC-1",
    )
    expect(requestPromptOf("ABC-1", { kind: "start", held: true }, "next-task")).toBe(
      `/next-task ABC-1 ${HELD_NOTE}`,
    )
  })

  it("先頭の / と前後の空白を畳む", () => {
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, " /next-task ")).toBe(
      "/next-task ABC-1",
    )
  })

  it("使える文字は英数字・-・_・: で、外れる値は未設定として固定の文面にする", () => {
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "plugin:next_task-2")).toBe(
      "/plugin:next_task-2 ABC-1",
    )
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "next task")).toBe(FIXED)
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "next-task; rm")).toBe(FIXED)
    expect(requestPromptOf("ABC-1", { kind: "start", held: false }, "//next-task")).toBe(FIXED)
  })

  it("計画・却下の文面は起動スキルで変わらない", () => {
    expect(requestPromptOf("ABC-1", { kind: "plan" }, "next-task")).toBe(
      requestPromptOf("ABC-1", { kind: "plan" }),
    )
    expect(requestPromptOf("ABC-1", { kind: "drop" }, "next-task")).toBe(
      requestPromptOf("ABC-1", { kind: "drop" }),
    )
  })
})
