import { describe, expect, it } from "vitest"

import {
  type WorkflowDiagram,
  type WorkflowDiagramEnd,
  workflowDiagramOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/workflow-diagram.ts"
import type {
  WorkflowRun,
  WorkflowRunAgent,
} from "../../../../../../../../src/shared/session/workflow-run.ts"
import { checkedTaskId } from "../../../../../../../fixture/task-id.ts"

const FOLDED = { phases: false, columns: [] }
const NOW = 10_000

const agent = (index: number, overrides: Partial<WorkflowRunAgent> = {}): WorkflowRunAgent => ({
  index,
  agentId: `agent-${String(index)}`,
  phaseTitle: "架空の段",
  state: "done",
  steps: [],
  stepCount: 0,
  ...overrides,
})
/** `queuedAt` = `startedAt` = start、終わりは start + duration の済んだエージェント。 */
const finished = (
  index: number,
  start: number,
  duration: number,
  overrides: Partial<WorkflowRunAgent> = {},
): WorkflowRunAgent =>
  agent(index, { queuedAt: start, startedAt: start, durationMs: duration, ...overrides })
const runOf = (agents: readonly WorkflowRunAgent[], ended = false): WorkflowRun => ({
  taskId: checkedTaskId("wf-1"),
  ended,
  phases: [],
  agents,
})

function arrowPairs(diagram: WorkflowDiagram): readonly (readonly [string, string, string])[] {
  const name = (point: WorkflowDiagramEnd): string => {
    switch (point.kind) {
      case "start":
        return "start"
      case "prelude":
        return "prelude"
      case "agent":
        return String(point.index)
      case "others":
        return `others:${point.column}`
      case "folded":
        return "folded"
      case "upcoming":
        return `upcoming:${point.column}`
    }
  }
  return diagram.arrows.map((arrow) => [name(arrow.from), name(arrow.to), arrow.kind])
}

function boxIndexes(diagram: WorkflowDiagram): readonly (readonly number[])[] {
  return diagram.columns.map((column) =>
    column.kind === "agents" ? column.boxes.map((box) => box.index) : [],
  )
}

/** 箱・「ほか n 件」・「済んだ n フェーズ」のどれかに載ったエージェントの index。 */
function accountedIndexes(diagram: WorkflowDiagram): readonly number[] {
  return [
    ...diagram.columns.flatMap((column) =>
      column.kind === "agents"
        ? [...column.boxes.map((box) => box.index), ...(column.others?.indexes ?? [])]
        : [],
    ),
    ...(diagram.foldedPhases?.indexes ?? []),
  ].toSorted((left, right) => left - right)
}

const TASK_FLOW_IDS = ["plan", "implement", "accept", "retrospect"]
// 実装役 → 受け入れ 1 → 直し（実装役と同じ種類）→ 受け入れ 2 → 振り返り
const TASK_FLOW = runOf([
  finished(0, 0, 100, {
    phaseTitle: "implement",
    label: "実装",
    agentType: "tsukumo-workflow:implementer",
    stepCount: 12,
  }),
  finished(1, 100, 50, {
    phaseTitle: "accept",
    label: "受け入れ 1",
    agentType: "tsukumo-workflow:acceptor",
  }),
  finished(2, 150, 80, {
    phaseTitle: "accept",
    label: "直し",
    agentType: "tsukumo-workflow:implementer",
  }),
  finished(3, 230, 40, {
    phaseTitle: "accept",
    label: "受け入れ 2",
    agentType: "tsukumo-workflow:acceptor",
  }),
  agent(4, {
    phaseTitle: "retrospect",
    label: "retrospector",
    agentType: "tsukumo-workflow:retrospector",
    state: "progress",
    queuedAt: 270,
    startedAt: 300,
  }),
])

describe("workflowDiagramOf（着手の箱）", () => {
  it("着手があれば最初のエージェントへ矢印を引く", () => {
    const diagram = workflowDiagramOf(
      TASK_FLOW,
      TASK_FLOW_IDS,
      NOW,
      { phases: true, columns: [] },
      undefined,
      true,
    )
    expect(arrowPairs(diagram)[0]).toEqual(["prelude", "0", "settled"])
  })

  it("着手が無ければ矢印を引かない", () => {
    const diagram = workflowDiagramOf(TASK_FLOW, TASK_FLOW_IDS, NOW, {
      phases: true,
      columns: [],
    })
    expect(diagram.arrows.some((arrow) => arrow.from.kind === "prelude")).toBe(false)
  })
})

describe("workflowDiagramOf（順に回る形）", () => {
  it("task-flow の並びで、直しへの矢印だけが差し戻しになり、推移で言える矢印は引かない", () => {
    const diagram = workflowDiagramOf(TASK_FLOW, TASK_FLOW_IDS, NOW, FOLDED)

    expect(arrowPairs(diagram)).toEqual([
      ["0", "1", "settled"],
      ["1", "2", "sentBack"],
      ["2", "3", "settled"],
      ["3", "4", "toRunning"],
    ])
    expect(diagram.columns.map((column) => [column.name, column.kind])).toEqual([
      ["implement", "agents"],
      ["accept", "agents"],
      ["retrospect", "agents"],
    ])
    expect(boxIndexes(diagram)).toEqual([[0], [1, 2, 3], [4]])
  })

  it("箱は一言の材料（済みの手順の数・差し戻しの元）と所要（済みは durationMs、走っているものは今までの経過）を持つ", () => {
    const diagram = workflowDiagramOf(TASK_FLOW, TASK_FLOW_IDS, NOW, FOLDED)
    const boxes = diagram.columns.flatMap((column) =>
      column.kind === "agents" ? column.boxes : [],
    )

    expect(boxes.map((box) => [box.index, box.state, box.sendsBack, box.elapsedMs])).toEqual([
      [0, "done", false, 100],
      [1, "done", true, 50],
      [2, "done", false, 80],
      [3, "done", false, 40],
      [4, "running", false, NOW - 300],
    ])
    expect(boxes[0]?.stepCount).toBe(12)
    expect(diagram.columns.map((column) => column.kind === "agents" && column.current)).toEqual([
      false,
      false,
      true,
    ])
  })

  it("名札と種類の短い名が大文字小文字を問わず同じなら札を隠し、名札が無ければ短い名、それも無ければ「エージェント n」", () => {
    const diagram = workflowDiagramOf(
      runOf([
        agent(0, { label: "Retrospector", agentType: "tsukumo-workflow:retrospector" }),
        agent(1, { agentType: "tsukumo-workflow:acceptor" }),
        agent(2),
        agent(3, { label: "受け入れ", agentType: "acceptor" }),
      ]),
      [],
      NOW,
      FOLDED,
    )
    const boxes = diagram.columns.flatMap((column) =>
      column.kind === "agents" ? column.boxes : [],
    )

    expect(boxes.map((box) => [box.name, box.typeName, box.hidesType])).toEqual([
      ["Retrospector", "retrospector", true],
      ["acceptor", "acceptor", true],
      ["エージェント 2", undefined, false],
      ["受け入れ", "acceptor", false],
    ])
  })

  it("general-purpose と種類の無いエージェントは差し戻しにせず、同じ列の同じ種類も差し戻しにしない", () => {
    const diagram = workflowDiagramOf(
      runOf([
        finished(0, 0, 10, { phaseTitle: "a", agentType: "general-purpose" }),
        finished(1, 10, 10, { phaseTitle: "b", agentType: "general-purpose" }),
        finished(2, 20, 10, { phaseTitle: "c" }),
        finished(3, 30, 10, { phaseTitle: "d" }),
        finished(4, 40, 10, { phaseTitle: "d", agentType: "x" }),
        finished(5, 50, 10, { phaseTitle: "d", agentType: "x" }),
      ]),
      ["a", "b", "c", "d"],
      NOW,
      FOLDED,
    )

    expect(arrowPairs(diagram).filter(([, , kind]) => kind === "sentBack")).toEqual([])
  })
})

describe("workflowDiagramOf（並んで回る形）", () => {
  it("並んで始まる3つのエージェントへ始まりの点から3本引き、3つから合流の1つへ1本ずつ引く", () => {
    const diagram = workflowDiagramOf(
      runOf([
        finished(0, 0, 100),
        finished(1, 0, 120),
        finished(2, 0, 90),
        agent(3, { state: "start", queuedAt: 130 }),
      ]),
      [],
      NOW,
      FOLDED,
    )

    expect(arrowPairs(diagram)).toEqual([
      ["start", "0", "settled"],
      ["start", "1", "settled"],
      ["start", "2", "settled"],
      ["0", "3", "toWaiting"],
      ["1", "3", "toWaiting"],
      ["2", "3", "toWaiting"],
    ])
  })

  it("最初に始まるエージェントが1つなら始まりの点を置かない", () => {
    const diagram = workflowDiagramOf(
      runOf([finished(0, 0, 10), finished(1, 10, 10)]),
      [],
      NOW,
      FOLDED,
    )

    expect(diagram.arrows.some((arrow) => arrow.from.kind === "start")).toBe(false)
  })

  it("durationMs の無い終わりは前の側にならず、終わりと同じ時刻に並んだエージェントは「後」とする", () => {
    const diagram = workflowDiagramOf(
      runOf([
        agent(0, { queuedAt: 0, startedAt: 0 }),
        finished(1, 0, 50),
        agent(2, { state: "start", queuedAt: 50 }),
      ]),
      [],
      NOW,
      FOLDED,
    )

    expect(arrowPairs(diagram)).toEqual([
      ["start", "0", "settled"],
      ["start", "1", "settled"],
      ["1", "2", "toWaiting"],
    ])
    expect(diagram.columns[0]?.kind === "agents" && diagram.columns[0].boxes[2]).toMatchObject({
      state: "waiting",
    })
    expect(diagram.columns[0]?.kind === "agents" && diagram.columns[0].boxes[2]).not.toHaveProperty(
      "elapsedMs",
    )
  })
})

describe("workflowDiagramOf（列の並びと名前）", () => {
  it("phaseIds に1つも引けない「phase n」の並びは phaseIndex の順に列にし、「これから」を作らない", () => {
    const diagram = workflowDiagramOf(
      runOf([
        agent(0, { phaseTitle: "phase 2", phaseIndex: 1 }),
        agent(1, { phaseTitle: "phase 1", phaseIndex: 0 }),
        agent(2, { phaseTitle: "", phaseIndex: 2 }),
        agent(3, { phaseTitle: "" }),
      ]),
      TASK_FLOW_IDS,
      NOW,
      { phases: true, columns: [] },
    )

    expect(diagram.columns.map((column) => [column.kind, column.name])).toEqual([
      ["agents", "phase 1"],
      ["agents", "phase 2"],
      ["agents", "フェーズ 3"],
      ["agents", "フェーズ"],
    ])
  })

  it("引けた列を phaseIds の順に、引けない列をそのあとに置き、最後に引けた列より後ろの phaseIds を「これから」にする", () => {
    const diagram = workflowDiagramOf(
      runOf([
        agent(0, { phaseTitle: "架空の引けない段", phaseIndex: 0 }),
        agent(1, { phaseTitle: "implement", state: "progress", startedAt: 1 }),
        agent(2, { phaseTitle: "plan" }),
      ]),
      TASK_FLOW_IDS,
      NOW,
      { phases: true, columns: [] },
    )

    expect(diagram.columns.map((column) => [column.kind, column.name])).toEqual([
      ["agents", "plan"],
      ["agents", "implement"],
      ["agents", "架空の引けない段"],
      ["upcoming", "accept"],
      ["upcoming", "retrospect"],
    ])
    expect(arrowPairs(diagram).filter(([, , kind]) => kind === "toUpcoming")).toEqual([
      ["2", "upcoming:accept", "toUpcoming"],
      ["upcoming:accept", "upcoming:retrospect", "toUpcoming"],
    ])
  })
})

describe("workflowDiagramOf（畳み）", () => {
  // エージェント6つ: 済み2・待ち1・失敗1・走っている1・済み1。残すのは走っている・失敗・待ち・新しい済みの4つ
  const crowded = runOf([
    agent(0),
    agent(1),
    agent(2, { state: "start" }),
    agent(3, { state: "error", stopReason: "stalled" }),
    agent(4, { state: "progress", startedAt: 1 }),
    agent(5),
  ])

  it("列の箱が6つ以上なら、走っている・失敗・待ち・済み（新しい順）の4つと「ほか 2 件」にする", () => {
    const diagram = workflowDiagramOf(crowded, [], NOW, FOLDED)
    const [column] = diagram.columns

    expect(boxIndexes(diagram)).toEqual([[2, 3, 4, 5]])
    expect(column?.kind === "agents" && column.others).toEqual({ count: 2, indexes: [0, 1] })
    expect(
      column?.kind === "agents" && column.boxes.find((box) => box.index === 3)?.stopReason,
    ).toBe("stalled")
  })

  it("unfold.columns にある列は畳まない", () => {
    const diagram = workflowDiagramOf(crowded, [], NOW, {
      phases: false,
      columns: [diagramKeyOf(crowded)],
    })

    expect(boxIndexes(diagram)).toEqual([[0, 1, 2, 3, 4, 5]])
  })

  it("「ほか n 件」の中のエージェントの矢印は畳みの箱を端にし、同じ端の組は1本にまとめる", () => {
    const diagram = workflowDiagramOf(
      runOf([
        finished(0, 0, 10),
        finished(1, 0, 10),
        finished(2, 0, 10),
        finished(3, 0, 10),
        finished(4, 0, 10),
        finished(5, 0, 10),
        agent(6, { phaseTitle: "架空の次の段", phaseIndex: 1, state: "start", queuedAt: 20 }),
      ]),
      [],
      NOW,
      FOLDED,
    )
    const column =
      diagram.columns.find((candidate) => candidate.kind === "agents" && candidate.others)?.key ??
      ""

    expect(arrowPairs(diagram)).toEqual([
      ["start", `others:${column}`, "settled"],
      ["start", "2", "settled"],
      ["start", "3", "settled"],
      ["start", "4", "settled"],
      ["start", "5", "settled"],
      [`others:${column}`, "6", "toWaiting"],
      ["2", "6", "toWaiting"],
      ["3", "6", "toWaiting"],
      ["4", "6", "toWaiting"],
      ["5", "6", "toWaiting"],
    ])
  })

  // 6列（各1つ、順に回る）。今は5列目
  const sixPhases = runOf([
    finished(0, 0, 10, { phaseTitle: "p1" }),
    finished(1, 10, 10, { phaseTitle: "p2" }),
    finished(2, 20, 10, { phaseTitle: "p3" }),
    finished(3, 30, 10, { phaseTitle: "p4" }),
    agent(4, { phaseTitle: "p5", state: "progress", queuedAt: 40, startedAt: 40 }),
    agent(5, { phaseTitle: "p6", state: "start", queuedAt: 50 }),
  ])
  const SIX_IDS = ["p1", "p2", "p3", "p4", "p5", "p6"]

  it("6列で今が5列目なら、3〜6列目を残して前の2列を「済んだ 2 フェーズ」に畳み、矢印の端も畳みにする", () => {
    const diagram = workflowDiagramOf(sixPhases, SIX_IDS, NOW, FOLDED)

    expect(diagram.columns.map((column) => column.name)).toEqual(["p3", "p4", "p5", "p6"])
    expect(diagram.foldedPhases).toEqual({ count: 2, indexes: [0, 1] })
    expect(arrowPairs(diagram)[0]).toEqual(["folded", "2", "settled"])
  })

  it("unfold.phases なら列を畳まない", () => {
    const diagram = workflowDiagramOf(sixPhases, SIX_IDS, NOW, { phases: true, columns: [] })

    expect(diagram.columns).toHaveLength(6)
    expect(diagram).not.toHaveProperty("foldedPhases")
  })

  it("利用者が開いた図（refoldable）だけが、畳み直せば畳まれる段の数を持つ", () => {
    const opened = workflowDiagramOf(sixPhases, SIX_IDS, NOW, {
      phases: true,
      refoldable: true,
      columns: [],
    })
    const finishedOpen = workflowDiagramOf(sixPhases, SIX_IDS, NOW, { phases: true, columns: [] })
    const folded = workflowDiagramOf(sixPhases, SIX_IDS, NOW, FOLDED)

    expect(opened.refoldable).toEqual({ count: 2 })
    expect(finishedOpen).not.toHaveProperty("refoldable")
    expect(folded).not.toHaveProperty("refoldable")
  })

  it("終わったワークフロースクリプトの走っている・待ちのエージェントは止まったエージェントにする", () => {
    const diagram = workflowDiagramOf(runOf(sixPhases.agents, true), SIX_IDS, NOW, FOLDED)
    const boxes = diagram.columns.flatMap((column) =>
      column.kind === "agents" ? column.boxes : [],
    )

    expect(boxes.map((box) => [box.index, box.state])).toEqual([
      [2, "done"],
      [3, "done"],
      [4, "stopped"],
      [5, "stopped"],
    ])
  })

  it.each([
    ["ほか n 件", crowded, []],
    ["済んだ n フェーズ", sixPhases, SIX_IDS],
    ["順に回る task-flow", TASK_FLOW, TASK_FLOW_IDS],
  ] as const)(
    "入力のエージェントは全部、箱・ほか n 件・済んだ n フェーズのどれかに残る（%s）",
    (_, run, ids) => {
      const diagram = workflowDiagramOf(run, ids, NOW, FOLDED)

      expect(accountedIndexes(diagram)).toEqual(run.agents.map((each) => each.index))
    },
  )
})

describe("workflowDiagramOf（範囲を受け持つ列）", () => {
  const IDS = ["plan", "impl-1", "impl-2", "impl-3", "accept"]

  it("実装役が impl-1 で走り今の段が impl-3 なら、impl-1〜impl-3 を受け持つ今の列になり、accept は「これから」に残る", () => {
    const run = runOf([
      finished(0, 0, 100, { phaseTitle: "plan" }),
      agent(1, { phaseTitle: "impl-1", state: "progress", queuedAt: 100, startedAt: 100 }),
    ])

    const diagram = workflowDiagramOf(run, IDS, NOW, FOLDED, "impl-3")

    expect(diagram.columns.map((column) => column.key)).toEqual(["impl-1", "accept"])
    expect(diagram.foldedPhases?.count).toBe(1)
    const implColumn = diagram.columns[0]
    expect(implColumn?.kind === "agents" && implColumn.spanKeys).toEqual([
      "impl-1",
      "impl-2",
      "impl-3",
    ])
    expect(implColumn?.kind === "agents" && implColumn.current).toBe(true)
  })

  it("受け入れ役が走っているとき、実装役の列は impl-1〜impl-3 を受け持ち、impl-2・impl-3 の列は消えない", () => {
    const run = runOf([
      finished(0, 0, 100, { phaseTitle: "impl-1" }),
      agent(1, { phaseTitle: "accept", state: "progress", queuedAt: 200, startedAt: 200 }),
    ])

    const diagram = workflowDiagramOf(run, IDS, NOW, FOLDED, "accept")

    const first = diagram.columns[0]
    expect(first?.kind === "agents" && first.spanKeys).toEqual(["impl-1", "impl-2", "impl-3"])
    expect(diagram.columns.map((column) => column.key)).toEqual(["impl-1", "accept"])
  })

  it("今の段が無い・範囲の外なら、走っている列は広げない", () => {
    const run = runOf([agent(0, { phaseTitle: "impl-1", state: "progress", startedAt: 0 })])

    const none = workflowDiagramOf(run, IDS, NOW, FOLDED)
    const outside = workflowDiagramOf(run, IDS, NOW, FOLDED, "plan")

    for (const diagram of [none, outside]) {
      const column = diagram.columns[0]
      expect(column?.kind === "agents" && column.spanKeys).toEqual(["impl-1"])
    }
  })
})

function diagramKeyOf(run: WorkflowRun): string {
  return workflowDiagramOf(run, [], NOW, FOLDED).columns[0]?.key ?? ""
}
