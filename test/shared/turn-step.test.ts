import { describe, expect, it } from "bun:test"

import { type SessionEvent } from "../../src/shared/session-event.ts"
import { applySessionEvent, INITIAL_SESSION_STATE } from "../../src/shared/session-state.ts"
import { currentTurnSteps, type TurnStep } from "../../src/shared/turn-step.ts"
import { requestRecord, speechRecord, toolRecord } from "../fixture/session-record.ts"

// フィクスチャはすべて手で書いた架空の依頼・ツール呼び出し（docs/coding-standards.md「会話内容の扱い」）。

/** `{ kind: "turn" }` の前提で `steps` を取り出す（前提が崩れたら分かるように投げる）。 */
function turnSteps(list: ReturnType<typeof currentTurnSteps>): readonly TurnStep[] {
  if (list.kind !== "turn") {
    throw new Error(`依頼が無い（"no-request"）: ${list.kind}`)
  }
  return list.steps
}

describe("currentTurnSteps（依頼の手順を最後の依頼から導く）", () => {
  it("依頼が一度も無ければ no-request を返す（「まだ依頼が無い」）", () => {
    expect(currentTurnSteps([], false)).toEqual({ kind: "no-request" })
    expect(currentTurnSteps([speechRecord()], false)).toEqual({ kind: "no-request" })
  })

  it("依頼はあるがツールを使っていなければ steps が空配列（no-request とは区別する）", () => {
    expect(currentTurnSteps([requestRecord()], false)).toEqual({ kind: "turn", steps: [] })
  })

  it("最後の依頼より後のツールだけを拾う（前の依頼のツールは含めない）", () => {
    const list = currentTurnSteps(
      [
        requestRecord({ turnId: 0 }),
        toolRecord({
          toolUseId: "toolu_old",
          status: { kind: "finished", result: { content: "ok", isError: false } },
        }),
        requestRecord({ turnId: 1 }),
        toolRecord({ toolUseId: "toolu_new" }),
      ],
      false,
    )

    expect(turnSteps(list).map((step) => step.toolUseId)).toEqual(["toolu_new"])
  })

  it("済み・失敗・実行中を status で分ける", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_done",
          status: { kind: "finished", result: { content: "ok", isError: false } },
        }),
        toolRecord({
          toolUseId: "toolu_failed",
          status: { kind: "finished", result: { content: "架空のエラー出力", isError: true } },
        }),
        toolRecord({ toolUseId: "toolu_running", status: { kind: "running" } }),
      ],
      false,
    )

    expect(turnSteps(list)).toEqual([
      {
        toolUseId: "toolu_done",
        name: "Bash",
        input: { command: "架空のコマンド" },
        nested: false,
        status: { kind: "done" },
      },
      {
        toolUseId: "toolu_failed",
        name: "Bash",
        input: { command: "架空のコマンド" },
        nested: false,
        status: { kind: "failed", output: "架空のエラー出力" },
      },
      {
        toolUseId: "toolu_running",
        name: "Bash",
        input: { command: "架空のコマンド" },
        nested: false,
        status: { kind: "running" },
      },
    ])
  })

  it("サブエージェントの中（nested）はそのまま持つ", () => {
    const list = currentTurnSteps(
      [requestRecord(), toolRecord({ toolUseId: "toolu_1", nested: true })],
      false,
    )

    expect(turnSteps(list)[0]?.nested).toBe(true)
  })

  it("session-ended のあとは実行中の手順を一覧から落とす", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        toolRecord({
          toolUseId: "toolu_done",
          status: { kind: "finished", result: { content: "ok", isError: false } },
        }),
        toolRecord({ toolUseId: "toolu_running", status: { kind: "running" } }),
      ],
      true,
    )

    expect(turnSteps(list).map((step) => step.toolUseId)).toEqual(["toolu_done"])
  })
})

describe("currentTurnSteps（report ツール）", () => {
  it("report の呼び出しは依頼の手順に出ない（speak と同じく tool-started にならない）", () => {
    const events: readonly SessionEvent[] = [
      { kind: "request", text: "架空の依頼", images: [] },
      {
        kind: "report",
        toolUseId: "toolu_r1",
        conclusion: "架空の結論。",
        body: "",
        favor: "",
        checks: [],
      },
    ]
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(currentTurnSteps(state.records, false)).toEqual({ kind: "turn", steps: [] })
  })
})
