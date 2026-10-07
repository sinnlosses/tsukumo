import { describe, expect, it } from "vitest"

import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
} from "../../../src/shared/session/session-state.ts"
import {
  currentTurnSteps,
  toolDuration,
  type TurnStep,
} from "../../../src/shared/session/turn-step.ts"
import { reportEvent } from "../../fixture/report-event.ts"
import {
  finishedToolStatus,
  requestRecord,
  speechRecord,
  toolRecord,
  workPlanRecord,
} from "../../fixture/session-record.ts"

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
    expect(currentTurnSteps([requestRecord()], false)).toEqual({
      kind: "turn",
      steps: [],
      plan: { kind: "none" },
    })
  })

  it("最後の依頼より後のツールだけを拾う（前の依頼のツールは含めない）", () => {
    const list = currentTurnSteps(
      [
        requestRecord({ turnId: 0 }),
        toolRecord({ toolUseId: "toolu_old", status: finishedToolStatus() }),
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
        toolRecord({ toolUseId: "toolu_done", status: finishedToolStatus() }),
        toolRecord({
          toolUseId: "toolu_failed",
          status: finishedToolStatus({
            result: { kind: "failed", output: { head: "架空のエラー出力", omittedLength: 0 } },
          }),
        }),
        toolRecord({ toolUseId: "toolu_running", status: { kind: "running" } }),
      ],
      false,
    )

    const stamped = { kind: "stamped", at: 0 } as const

    expect(turnSteps(list)).toEqual([
      {
        toolUseId: "toolu_done",
        name: "Bash",
        input: { command: "架空のコマンド" },
        nested: false,
        startedAt: stamped,
        status: { kind: "done", finishedAt: stamped },
        backgroundEnd: { kind: "foreground" },
        phase: { kind: "none" },
      },
      {
        toolUseId: "toolu_failed",
        name: "Bash",
        input: { command: "架空のコマンド" },
        nested: false,
        startedAt: stamped,
        status: {
          kind: "failed",
          output: { head: "架空のエラー出力", omittedLength: 0 },
          finishedAt: stamped,
        },
        backgroundEnd: { kind: "foreground" },
        phase: { kind: "none" },
      },
      {
        toolUseId: "toolu_running",
        name: "Bash",
        input: { command: "架空のコマンド" },
        nested: false,
        startedAt: stamped,
        status: { kind: "running" },
        backgroundEnd: { kind: "foreground" },
        phase: { kind: "none" },
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
        toolRecord({ toolUseId: "toolu_done", status: finishedToolStatus() }),
        toolRecord({ toolUseId: "toolu_running", status: { kind: "running" } }),
      ],
      true,
    )

    expect(turnSteps(list).map((step) => step.toolUseId)).toEqual(["toolu_done"])
  })
})

describe("toolDuration（所要時間。tool-started / tool-finished の at から機械で測る）", () => {
  it("開始・終了の両方が stamped なら known", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        toolRecord({
          startedAt: { kind: "stamped", at: 1_000 },
          status: finishedToolStatus({ finishedAt: { kind: "stamped", at: 4_500 } }),
        }),
      ],
      false,
    )

    expect(toolDuration(turnSteps(list)[0]!)).toEqual({ kind: "known", milliseconds: 3_500 })
  })

  it("背景で走らせた Bash は、済みでも知らせを待つあいだは unknown、届いたら開始から知らせまで", () => {
    const backgroundBash = (backgroundEnd: TurnStep["backgroundEnd"]) =>
      toolRecord({
        startedAt: { kind: "stamped", at: 1_000 },
        status: finishedToolStatus({ finishedAt: { kind: "stamped", at: 1_300 } }),
        backgroundEnd,
      })
    const list = currentTurnSteps(
      [
        requestRecord(),
        backgroundBash({ kind: "awaiting" }),
        backgroundBash({ kind: "notified", at: { kind: "stamped", at: 61_000 } }),
      ],
      false,
    )

    expect(turnSteps(list).map((step) => toolDuration(step))).toEqual([
      { kind: "unknown" },
      { kind: "known", milliseconds: 60_000 },
    ])
  })

  it("実行中は unknown", () => {
    const list = currentTurnSteps(
      [requestRecord(), toolRecord({ status: { kind: "running" } })],
      false,
    )

    expect(toolDuration(turnSteps(list)[0]!)).toEqual({ kind: "unknown" })
  })

  it("復元した手順（開始・終了が restored）は unknown（replay の速さを所要時間に見せない）", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        toolRecord({
          startedAt: { kind: "restored" },
          status: finishedToolStatus({ finishedAt: { kind: "restored" } }),
        }),
      ],
      false,
    )

    expect(toolDuration(turnSteps(list)[0]!)).toEqual({ kind: "unknown" })
  })

  it("transcript から時刻を戻した手順（recovered）は元の時刻の差になる", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        toolRecord({
          startedAt: { kind: "recovered", at: 1_000 },
          status: finishedToolStatus({ finishedAt: { kind: "recovered", at: 4_500 } }),
        }),
      ],
      false,
    )

    expect(toolDuration(turnSteps(list)[0]!)).toEqual({ kind: "known", milliseconds: 3_500 })
  })
})

describe("currentTurnSteps（report ツール）", () => {
  it("report の呼び出しは依頼の手順に出ない（speak と同じく tool-started にならない）", () => {
    const events: readonly SessionEvent[] = [
      { kind: "request", text: "架空の依頼", images: [] },
      reportEvent({ toolUseId: "toolu_r1" }),
    ]
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )

    expect(currentTurnSteps(state.records, false)).toEqual({
      kind: "turn",
      steps: [],
      plan: { kind: "none" },
    })
  })
})

describe("currentTurnSteps（段取り）", () => {
  it("手順はそれより前で最後の段取りの今の段を持ち、plan はその依頼で最後の段取り", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        toolRecord({ toolUseId: "toolu_before" }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 0 }),
        toolRecord({ toolUseId: "toolu_a" }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 1 }),
        toolRecord({ toolUseId: "toolu_b" }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 2 }),
        toolRecord({ toolUseId: "toolu_after" }),
      ],
      false,
    )

    expect(turnSteps(list).map((step) => step.phase)).toEqual([
      { kind: "none" },
      { kind: "phase", indexes: [0], count: 2, name: "架空の段A" },
      { kind: "phase", indexes: [1], count: 2, name: "架空の段B" },
      { kind: "none" },
    ])
    expect(list).toMatchObject({
      plan: { kind: "planned", phases: ["架空の段A", "架空の段B"], current: 2 },
    })
  })

  it("段が戻る・段の並びが組み替わる段取りでも、手順は始まったときの段取りの段を持つ", () => {
    const list = currentTurnSteps(
      [
        requestRecord(),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 1, phaseSummary: "まとめ" }),
        toolRecord({ toolUseId: "toolu_1", status: finishedToolStatus() }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 0 }),
        toolRecord({ toolUseId: "toolu_2", status: finishedToolStatus() }),
        workPlanRecord({ phases: ["架空の段X", "架空の段Y", "架空の段Z"], current: 2 }),
        toolRecord({ toolUseId: "toolu_running" }),
        toolRecord({ toolUseId: "toolu_3", status: finishedToolStatus() }),
      ],
      true,
    )

    expect(turnSteps(list).map((step) => [step.toolUseId, step.phase])).toEqual([
      ["toolu_1", { kind: "phase", indexes: [1], count: 2, name: "架空の段B" }],
      ["toolu_2", { kind: "phase", indexes: [0], count: 2, name: "架空の段A" }],
      ["toolu_3", { kind: "phase", indexes: [2], count: 3, name: "架空の段Z" }],
    ])
    expect(list).toMatchObject({ plan: { phases: ["架空の段X", "架空の段Y", "架空の段Z"] } })
  })

  it("前の依頼の段取りは持ち越さない", () => {
    const list = currentTurnSteps(
      [
        requestRecord({ turnId: 0 }),
        workPlanRecord({ phases: ["架空の段A", "架空の段B"], current: 1 }),
        requestRecord({ turnId: 1 }),
        toolRecord({ toolUseId: "toolu_new" }),
      ],
      false,
    )

    expect(list).toMatchObject({ plan: { kind: "none" } })
    expect(turnSteps(list)[0]?.phase).toEqual({ kind: "none" })
  })
})
