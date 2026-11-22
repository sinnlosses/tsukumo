import { describe, expect, it } from "vitest"

import {
  workflowAgentCountsOf,
  workflowArrowPathsOf,
  workflowBoxLabelOf,
  workflowBoxNoteOf,
  workflowDiagramEndKeyOf,
  workflowIsCurrentColumn,
  workflowUpcomingNoteOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-diagram-view.ts"
import type {
  WorkflowDiagramArrow,
  WorkflowDiagramBox,
  WorkflowDiagramColumn,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-diagram.ts"
import type {
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../../src/shared/session/workflow-run.ts"
import { checkedTaskId } from "../../../../../../../fixture/task-id.ts"

const agent = (index: number, overrides: Partial<WorkflowRunAgent> = {}): WorkflowRunAgent => ({
  index,
  phaseTitle: "架空の段",
  state: "done",
  steps: [],
  stepCount: 0,
  ...overrides,
})
const runOf = (agents: readonly WorkflowRunAgent[], ended: boolean): WorkflowRun => ({
  taskId: checkedTaskId("wf-1"),
  ended,
  phases: [],
  agents,
})
const box = (overrides: Partial<WorkflowDiagramBox>): WorkflowDiagramBox => ({
  index: 0,
  state: "done",
  name: "架空の名札",
  hidesType: false,
  sendsBack: false,
  ...overrides,
})

describe("workflowAgentCountsOf", () => {
  it("状態ごとに数え、0 の状態は出さない", () => {
    const run = runOf(
      [
        agent(0, { state: "progress", startedAt: 1 }),
        agent(1, { state: "done" }),
        agent(2, { state: "done" }),
        agent(3, { state: "start" }),
      ],
      false,
    )

    expect(workflowAgentCountsOf(run).map((count) => count.label)).toEqual([
      "動いている 1",
      "済み 2",
      "待ち 1",
    ])
  })

  it("終わったワークフローの走っているエージェントと待ちのエージェントは「止まった」に数える", () => {
    const run = runOf(
      [agent(0, { state: "progress", startedAt: 1 }), agent(1, { state: "start" })],
      true,
    )

    expect(workflowAgentCountsOf(run).map((count) => count.label)).toEqual(["止まった 2"])
  })
})

describe("workflowDiagramEndKeyOf", () => {
  it("端の種類ごとに別の鍵を返す", () => {
    const keys = [
      workflowDiagramEndKeyOf({ kind: "start" }),
      workflowDiagramEndKeyOf({ kind: "agent", index: 3 }),
      workflowDiagramEndKeyOf({ kind: "others", column: "c" }),
      workflowDiagramEndKeyOf({ kind: "folded" }),
      workflowDiagramEndKeyOf({ kind: "upcoming", column: "c" }),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("workflowArrowPathsOf", () => {
  const rects = new Map([
    ["agent:0", { left: 110, top: 210, width: 100, height: 40 }],
    ["agent:1", { left: 110, top: 270, width: 100, height: 40 }],
    ["agent:2", { left: 310, top: 210, width: 100, height: 40 }],
  ])
  const origin = { left: 100, top: 200 }
  const arrow = (from: number, to: number, kind: WorkflowDiagramArrow["kind"]) => ({
    from: { kind: "agent", index: from } as const,
    to: { kind: "agent", index: to } as const,
    kind,
  })

  it("端の矩形が欠けた矢印は捨てる", () => {
    const paths = workflowArrowPathsOf(
      [arrow(0, 1, "settled"), arrow(0, 9, "toRunning")],
      rects,
      origin,
    )

    expect(paths.map((path) => path.key)).toEqual(["agent:0>agent:1"])
  })

  it("同じ列は下端から上端へまっすぐ、別の列は右の辺から左の辺へ結び、根の左上からの座標にする", () => {
    const [down, across] = workflowArrowPathsOf(
      [arrow(0, 1, "settled"), arrow(0, 2, "toRunning")],
      rects,
      origin,
    )

    expect(down?.d).toBe("M60 50 L60 70")
    expect(across?.d).toBe("M110 30 C160 30, 160 30, 210 30")
  })

  it("同じ列で間に別の箱があれば、右の辺どうしを列の右へ膨らませて結ぶ", () => {
    const stacked = new Map([
      ...rects,
      ["agent:3", { left: 110, top: 330, width: 100, height: 40 }],
    ])

    const [around] = workflowArrowPathsOf([arrow(0, 3, "toWaiting")], stacked, origin)

    expect(around?.d).toBe("M110 30 C124 30, 124 150, 110 150")
  })

  it("差し戻しの矢印だけが字を置く中点を持つ", () => {
    const paths = workflowArrowPathsOf(
      [arrow(0, 1, "sentBack"), arrow(0, 2, "toRunning")],
      rects,
      origin,
    )

    expect(paths.map((path) => path.labelAt)).toEqual([{ x: 60, y: 60 }, undefined])
  })
})

describe("workflowBoxLabelOf", () => {
  it("名札・種類の短い名・状態を読点で並べる", () => {
    expect(workflowBoxLabelOf(box({ typeName: "acceptor", state: "running" }))).toBe(
      "架空の名札、acceptor、動いている",
    )
  })

  it("種類が無いか名札と同じ語なら種類を抜く", () => {
    expect(workflowBoxLabelOf(box({}))).toBe("架空の名札、済み")
    expect(workflowBoxLabelOf(box({ typeName: "架空の名札", hidesType: true }))).toBe(
      "架空の名札、済み",
    )
  })
})

describe("workflowBoxNoteOf", () => {
  it.each([
    [box({ state: "done", stepCount: 12 }), "済み · 手順 12"],
    [box({ state: "failed", stopReason: "blocked" }), "安全の判定で止まった"],
    [box({ state: "failed" }), "失敗した"],
    [box({ state: "done", sendsBack: true }), "差し戻し"],
    [box({ state: "stopped" }), "止まった"],
    [box({ state: "running" }), ""],
  ])("%o は「%s」", (given, expected) => {
    expect(workflowBoxNoteOf(given)).toBe(expected)
  })
})

describe("workflowIsCurrentColumn", () => {
  const columns: readonly WorkflowDiagramColumn[] = [
    { kind: "agents", key: "accept", name: "accept", current: false, boxes: [] },
    { kind: "agents", key: "retrospect", name: "retrospect", current: true, boxes: [] },
    { kind: "upcoming", key: "ship", name: "ship" },
  ]
  const currentKeysOf = (finished: boolean, planCurrentKey?: string): readonly string[] =>
    columns
      .filter((column) => workflowIsCurrentColumn(column, columns, finished, planCurrentKey))
      .map((column) => column.key)

  it("依頼が済んだら最後の列だけ", () => {
    expect(currentKeysOf(true, "retrospect")).toEqual(["ship"])
  })
  it("ワークプランの今のフェーズが図の列なら、エージェントの載らない列でもその列だけ", () => {
    expect(currentKeysOf(false, "ship")).toEqual(["ship"])
  })
  it("今のフェーズが図の列でないか無ければ、図の今の列", () => {
    expect(currentKeysOf(false, "plan")).toEqual(["retrospect"])
    expect(currentKeysOf(false)).toEqual(["retrospect"])
  })
})

describe("workflowUpcomingNoteOf", () => {
  it.each<[boolean, boolean, string]>([
    [true, false, "済み"],
    [false, true, "いま"],
    [false, false, "これから"],
  ])("済んだ %s・今の列 %s なら「%s」", (finished, current, expected) => {
    expect(workflowUpcomingNoteOf(finished, current)).toBe(expected)
  })
})
