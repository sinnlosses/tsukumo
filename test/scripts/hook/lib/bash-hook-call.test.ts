// hook の入力 JSON から Bash の呼び出しを取り出す処理の契約。

import { describe, expect, test } from "vitest"

import { parseBashHookCall } from "../../../../scripts/hook/lib/bash-hook-call.ts"

function bashInput(extra: Record<string, unknown> = {}, toolInput: object = { command: "ls" }) {
  return JSON.stringify({ tool_name: "Bash", tool_input: toolInput, ...extra })
}

describe("parseBashHookCall", () => {
  test.each([
    ["空文字", ""],
    ["壊れた JSON", "{not json"],
    ["配列", "[]"],
    ["null", "null"],
    ["Bash 以外のツール", JSON.stringify({ tool_name: "Read", tool_input: { command: "ls" } })],
    ["command が文字列でない", bashInput({}, { command: 1 })],
    ["tool_input が無い", JSON.stringify({ tool_name: "Bash" })],
  ])("%s は undefined", (_name, raw) => {
    expect(parseBashHookCall(raw)).toBeUndefined()
  })

  test("メインの呼び出しは fromSubagent が偽", () => {
    expect(parseBashHookCall(bashInput())).toEqual({
      command: "ls",
      cwd: undefined,
      runsInBackground: false,
      fromSubagent: false,
      toolUseId: undefined,
      event: undefined,
    })
  })

  test("tool_use_id と hook_event_name を読む", () => {
    expect(
      parseBashHookCall(bashInput({ tool_use_id: "toolu_1", hook_event_name: "PostToolUse" })),
    ).toMatchObject({ toolUseId: "toolu_1", event: "PostToolUse" })
  })

  test("agent_id が文字列なら委譲先の呼び出し", () => {
    expect(parseBashHookCall(bashInput({ agent_id: "a1" }))?.fromSubagent).toBe(true)
    expect(parseBashHookCall(bashInput({ agent_id: 1 }))?.fromSubagent).toBe(false)
  })

  test("run_in_background と cwd を読む", () => {
    expect(
      parseBashHookCall(
        bashInput({ cwd: "/tmp/架空" }, { command: "ls", run_in_background: true }),
      ),
    ).toMatchObject({ cwd: "/tmp/架空", runsInBackground: true })
  })
})
