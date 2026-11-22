// 見本帳の「画面の部品」のうち、「手順」の全体の詳細の頭に置くワークフローの図の例。

import { parseTaskId, type TaskId } from "../../../../shared/session-driver/task-id.ts"
import type { WorkflowAgentHand } from "../../page/conversation/components/main-view/domain/workflow-agent-hand.ts"
import type { WorkStripSteps } from "../../page/conversation/components/main-view/hooks/use-work-strip-step-list.ts"
import { PresentationalWorkflowAgentHand } from "../../page/conversation/components/main-view/presentational-workflow-agent-hand.tsx"
import { PresentationalWorkflowDiagrams } from "../../page/conversation/components/main-view/presentational-workflow-diagram.tsx"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

function exampleTaskId(): TaskId {
  const taskId = parseTaskId("example-workflow")
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
    onUnfoldColumn: noop,
    onOpenRun: noop,
    onAgentPress: noop,
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
          columnDurations: new Map([
            ["実装", "9分48秒"],
            ["受け入れ", "4分08秒〜"],
          ]),
          diagram: {
            columns: [
              {
                kind: "agents",
                key: "実装",
                name: "実装",
                current: false,
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

const EXAMPLE_HAND: WorkflowAgentHand = {
  index: 2,
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
    path: "page/conversation/components/main-view/presentational-workflow-agent-hand.tsx",
    render: () => (
      <>
        <PresentationalWorkflowAgentHand hand={EXAMPLE_HAND} />
        <PresentationalWorkflowAgentHand
          hand={{ ...EXAMPLE_HAND, index: 3, kind: "既定のエージェント", model: "", total: 3 }}
        />
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-workflow-diagram.tsx",
    render: () => <PresentationalWorkflowDiagrams steps={exampleSteps()} />,
  },
]
