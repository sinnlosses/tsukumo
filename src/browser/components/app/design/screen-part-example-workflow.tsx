// 見本帳の「画面の部品」のうち、「手順」の全体の詳細の頭に置くワークフローの図の例。

import { parseTaskId, type TaskId } from "../../../../shared/session-driver/task-id.ts"
import type { WorkStripSteps } from "../../page/conversation/components/main-view/hooks/use-work-strip-step-list.ts"
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

export const WORKFLOW_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "flow",
    path: "page/conversation/components/main-view/presentational-workflow-diagram.tsx",
    render: () => <PresentationalWorkflowDiagrams steps={exampleSteps()} />,
  },
]
