import { describe, expect, it } from "vitest"

import { mainViewEntries } from "../../../src/shared/session/main-view.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { MAX_TOOL_TEXT_LENGTH } from "../../../src/shared/session/session-record.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent", () => {
  it("結果が届くまでのツールの記録は running", () => {
    const view = apply({
      kind: "tool-started",
      toolUseId: "toolu_1",
      name: "Read",
      input: {},
      parentToolUseId: undefined,
    })

    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        nested: false,
        startedAt: { kind: "stamped", at: 0 },
        status: { kind: "running" },
        backgroundEnd: { kind: "foreground" },
      },
    ])
  })

  it("ツールの結果を、対応する tool_use の記録に合わせる（mainViewEntries は toolUseId 等を落として渡す）", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        parentToolUseId: undefined,
      },
      { kind: "tool-finished", toolUseId: "toolu_1", content: "ダミーの結果", isError: true },
    )

    // ツールの記録そのものは `toolUseId` / `nested` を持つ（サイドバー用途と
    // 突き合わせ用。docs/architecture/display.md「表示」）。
    expect(view.records).toEqual([
      {
        kind: "tool",
        toolUseId: "toolu_1",
        name: "Read",
        input: { path: "/tmp/a" },
        nested: false,
        startedAt: { kind: "stamped", at: 0 },
        status: {
          kind: "finished",
          finishedAt: { kind: "stamped", at: 0 },
          result: { kind: "failed", output: { head: "ダミーの結果", omittedLength: 0 } },
        },
        backgroundEnd: { kind: "foreground" },
      },
    ])
    // メインビューへ渡す tool の記録が持つのは名前・入力・結果だけ（描くかどうかは
    // `Turn` の仕事で、いまはツールを描かない）。
    expect(mainViewEntries(view)).toEqual([
      {
        kind: "tool",
        name: "Read",
        input: { path: "/tmp/a" },
        status: {
          kind: "finished",
          finishedAt: { kind: "stamped", at: 0 },
          result: { kind: "failed", output: { head: "ダミーの結果", omittedLength: 0 } },
        },
      },
    ])
  })

  it("上限を超える失敗の結果は、先頭の上限ぶんと落とした字数だけを記録に入れる", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Bash",
        input: {},
        parentToolUseId: undefined,
      },
      {
        kind: "tool-finished",
        toolUseId: "toolu_1",
        content: "架".repeat(MAX_TOOL_TEXT_LENGTH + 5),
        isError: true,
      },
    )

    expect(view.records[0]).toMatchObject({
      status: {
        result: {
          kind: "failed",
          output: { head: "架".repeat(MAX_TOOL_TEXT_LENGTH), omittedLength: 5 },
        },
      },
    })
  })

  it("成功した結果は本文を記録に入れず、lastToolFailureAt も変えない", () => {
    const view = apply(
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      {
        kind: "tool-finished",
        toolUseId: "toolu_1",
        content: "架".repeat(MAX_TOOL_TEXT_LENGTH + 5),
        isError: false,
      },
    )

    expect(view.records[0]).toMatchObject({ status: { result: { kind: "succeeded" } } })
    expect(view.lastToolFailureAt).toBeUndefined()
  })

  it("対応する tool_use が無い結果は、失敗でも記録に足さず lastToolFailureAt も打たない", () => {
    const view = apply({
      kind: "tool-finished",
      toolUseId: "toolu_unknown",
      content: "ダミーの結果",
      isError: true,
    })

    expect(mainViewEntries(view)).toEqual([])
    expect(view.lastToolFailureAt).toBeUndefined()
  })

  it("tool-finished が isError:true のとき lastToolFailureAt にその時刻を打つ（立ち絵の「失敗でびくっ」の材料）", () => {
    expect(INITIAL_SESSION_STATE.lastToolFailureAt).toBeUndefined()

    const started = applySessionEvent(
      INITIAL_SESSION_STATE,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      100,
    )
    const failed = applySessionEvent(
      started,
      { kind: "tool-finished", toolUseId: "toolu_1", content: "失敗した", isError: true },
      400,
    )

    expect(failed.lastToolFailureAt).toBe(400)
  })
})
