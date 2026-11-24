// 見本帳の「画面の部品」のうち、「手順」の全体の詳細の頭に置くワークフローの図の例。

import { parseTaskId, type TaskId } from "../../../../shared/session-driver/task-id.ts"
import type { WorkflowAgentHand } from "../../page/conversation/components/main-view/domain/workflow-agent-hand.ts"
import type { WorkStripSteps } from "../../page/conversation/components/main-view/hooks/use-work-strip-step-list.ts"
import { PresentationalWorkflowAgentHand } from "../../page/conversation/components/main-view/presentational-workflow-agent-hand.tsx"
import { PresentationalWorkflowDiagrams } from "../../page/conversation/components/main-view/presentational-workflow-diagram.tsx"
import { PresentationalWorkflowMainBox } from "../../page/conversation/components/main-view/presentational-workflow-main-box.tsx"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

function exampleTaskId(name = "example-workflow"): TaskId {
  const taskId = parseTaskId(name)
  if (taskId === undefined) {
    throw new Error("見本の taskId が空になった")
  }
  return taskId
}

function exampleSteps(): WorkStripSteps {
  return {
    list: { kind: "closed" },
    toggleLabel: "手順 12件",
    hasFailedAgent: false,
    onToggle: noop,
    onExpandDone: noop,
    onExpandSteps: noop,
    onUnfoldPhases: noop,
    onFoldPhases: noop,
    onUnfoldColumn: noop,
    onOpenRun: noop,
    onAgentPress: noop,
    onPreludePress: noop,
    phaseCountLabel: "",
    card: [],
    rest: [],
    phaseTimes: { kind: "none" },
    backgroundList: { kind: "none" },
    elapsedLabel: "経過 6分12秒",
    estimate: { kind: "none" },
    workflows: [
      {
        taskId: exampleTaskId(),
        name: "架空の流れ",
        counts: [
          { state: "running", count: 1, label: "動いている 1" },
          { state: "done", count: 2, label: "済み 2" },
          { state: "waiting", count: 1, label: "待ち 1" },
        ],
        view: {
          kind: "open",
          hand: EXAMPLE_HAND,
          mainBoxes: {},
          columnDurations: new Map([
            ["実装", "9分48秒"],
            ["受け入れ", "4分08秒〜"],
          ]),
          finished: false,
          planCurrentKey: "受け入れ",
          diagram: {
            columns: [
              {
                kind: "agents",
                key: "実装",
                name: "実装",
                current: false,
                spanKeys: ["実装"],
                boxes: [
                  {
                    index: 0,
                    state: "done",
                    name: "実装",
                    typeName: "implementer",
                    hidesType: false,
                    stepCount: 42,
                    sendsBack: false,
                    elapsedMs: 588_000,
                  },
                ],
              },
              {
                kind: "agents",
                key: "受け入れ",
                name: "受け入れ",
                current: true,
                spanKeys: ["受け入れ"],
                boxes: [
                  {
                    index: 1,
                    state: "done",
                    name: "受け入れ 1",
                    typeName: "acceptor",
                    hidesType: false,
                    stepCount: 9,
                    sendsBack: true,
                    elapsedMs: 130_000,
                  },
                  {
                    index: 2,
                    state: "running",
                    name: "直し 1",
                    typeName: "implementer",
                    hidesType: false,
                    sendsBack: false,
                    elapsedMs: 118_000,
                  },
                  {
                    index: 3,
                    state: "waiting",
                    name: "受け入れ 2",
                    typeName: "acceptor",
                    hidesType: false,
                    sendsBack: false,
                  },
                ],
              },
              { kind: "upcoming", key: "振り返り", name: "振り返り" },
            ],
            arrows: [
              {
                from: { kind: "agent", index: 0 },
                to: { kind: "agent", index: 1 },
                kind: "settled",
              },
              {
                from: { kind: "agent", index: 1 },
                to: { kind: "agent", index: 2 },
                kind: "sentBack",
              },
              {
                from: { kind: "agent", index: 2 },
                to: { kind: "agent", index: 3 },
                kind: "toWaiting",
              },
              {
                from: { kind: "agent", index: 3 },
                to: { kind: "upcoming", column: "振り返り" },
                kind: "toUpcoming",
              },
            ],
          },
        },
      },
    ],
  }
}

const SPAN_KEYS = ["impl-1", "impl-2", "impl-3"] as const

function spanWorkflow(phase: "implementing" | "accepting"): WorkStripSteps["workflows"][number] {
  const implementing = phase === "implementing"
  const implementer = {
    index: 0,
    state: implementing ? ("running" as const) : ("done" as const),
    name: "実装",
    typeName: "implementer",
    hidesType: false,
    sendsBack: false,
    ...(implementing ? { elapsedMs: 293_000 } : { stepCount: 120, elapsedMs: 588_000 }),
  }
  return {
    taskId: exampleTaskId(`example-span-${phase}`),
    name: implementing ? "架空の流れ（実装中）" : "架空の流れ（受け入れ中）",
    counts: [{ state: "running", count: 1, label: "動いている 1" }],
    view: {
      kind: "open",
      mainBoxes: {},
      columnDurations: new Map([
        ["impl-1", "1分21秒"],
        ["impl-2", "37秒"],
        ["impl-3", implementing ? "2分54秒〜" : "1分10秒"],
        ["accept", implementing ? "" : "1分05秒〜"],
      ]),
      finished: false,
      planCurrentKey: implementing ? "impl-3" : "accept",
      diagram: {
        columns: [
          {
            kind: "agents",
            key: "impl-1",
            name: "impl-1",
            current: implementing,
            spanKeys: SPAN_KEYS,
            boxes: [implementer],
          },
          implementing
            ? { kind: "upcoming", key: "accept", name: "accept" }
            : {
                kind: "agents",
                key: "accept",
                name: "accept",
                current: true,
                spanKeys: ["accept"],
                boxes: [
                  {
                    index: 1,
                    state: "running",
                    name: "受け入れ",
                    typeName: "acceptor",
                    hidesType: false,
                    sendsBack: false,
                    elapsedMs: 65_000,
                  },
                ],
              },
        ],
        arrows: [],
      },
    },
  }
}

const EXAMPLE_HAND: WorkflowAgentHand = {
  owner: { kind: "agent", index: 2 },
  chosen: true,
  state: "running",
  name: "直し 1",
  kind: "tsukumo-workflow:implementer",
  model: "sonnet",
  total: 42,
  steps: [
    {
      key: "t1",
      clock: "14:02:11",
      state: "done",
      tool: "Read",
      target: "src/shared/session/workflow-run.ts",
      elapsed: "1秒",
    },
    {
      key: "t2",
      clock: "14:02:19",
      state: "failed",
      tool: "Bash",
      target: "pnpm run check",
      elapsed: "31秒",
    },
    {
      key: "t3",
      clock: "14:02:55",
      state: "running",
      tool: "Edit",
      target: "src/browser/components/ui/list/list.tsx",
      elapsed: "4秒",
    },
  ],
}

export const WORKFLOW_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-workflow-main-box.tsx",
    render: () => (
      <>
        <PresentationalWorkflowMainBox
          name="送り出し"
          box={{ count: 3, duration: "2分39秒" }}
          endKey="example-landing"
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-workflow-agent-hand.tsx",
    render: () => (
      <>
        <PresentationalWorkflowAgentHand hand={EXAMPLE_HAND} />
        <PresentationalWorkflowAgentHand
          hand={{
            ...EXAMPLE_HAND,
            owner: { kind: "agent", index: 3 },
            kind: "既定のエージェント",
            model: "",
            total: 3,
          }}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-workflow-diagram.tsx",
    render: () => {
      const steps = exampleSteps()
      return (
        <PresentationalWorkflowDiagrams
          steps={{
            ...steps,
            workflows: [
              ...steps.workflows,
              spanWorkflow("implementing"),
              spanWorkflow("accepting"),
            ],
          }}
        />
      )
    },
  },
]
