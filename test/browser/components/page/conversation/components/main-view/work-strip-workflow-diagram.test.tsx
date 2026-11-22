import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { WorkStrip } from "../../../../../../../src/browser/components/page/conversation/components/main-view/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import type { BackgroundTask } from "../../../../../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import type { WorkflowAgent } from "../../../../../../../src/shared/session/workflow-step.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import { checkedTaskId } from "../../../../../../fixture/task-id.ts"
import { plan, stateAfter } from "../../../../../../fixture/work-strip-event.ts"
import { putSession } from "../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

const PHASES = ["架空の計画", "架空の実装", "架空の受け入れ", "架空の振り返り"]
const WORKFLOW = {
  taskId: checkedTaskId("wf-1"),
  kind: "workflow",
  description: "架空の流れ",
} satisfies BackgroundTask
const SHELL = {
  taskId: checkedTaskId("bash-1"),
  kind: "shell",
  description: "架空の待ち",
} satisfies BackgroundTask

const workPlan: SessionEvent = { ...plan(2, "", PHASES), phaseIds: PHASES }
const tasksChanged: SessionEvent = { kind: "background-tasks-changed", tasks: [WORKFLOW, SHELL] }
const IMPLEMENTER: WorkflowAgent = {
  index: 0,
  agentId: "agent-0",
  label: "架空の実装役",
  agentType: "fake:implementer",
  phaseTitle: "架空の実装",
  state: "done",
  queuedAt: 0,
  startedAt: 0,
  durationMs: 1,
}
const reviewer = (index: number): WorkflowAgent => ({
  index,
  agentId: `agent-${String(index)}`,
  label: `架空の受け入れ ${String(index)}`,
  phaseTitle: "架空の受け入れ",
  state: "progress",
  queuedAt: 2,
  startedAt: 2,
})
const progressOf = (agents: readonly WorkflowAgent[]): SessionEvent => ({
  kind: "workflow-progress",
  progress: { taskId: WORKFLOW.taskId, phases: [], agents },
})

function openSteps(events: readonly SessionEvent[]): HTMLElement {
  putSession(stateAfter([requestEvent(), workPlan, ...events]))
  render(<WorkStrip />)
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: /^手順 \d+件$/ }))
  })
  return screen.getByRole("region", { name: "依頼の手順" })
}

describe("WorkStrip のワークフローの図", () => {
  it("「手順」を開くと図の領域・箱の読み上げの名前・頭の件数が出る", () => {
    const list = openSteps([tasksChanged, progressOf([IMPLEMENTER, reviewer(1)])])

    const diagram = screen.getByRole("region", { name: "架空の流れ の図" })
    expect(list.contains(diagram)).toBe(true)
    expect(screen.getByRole("button", { name: "架空の実装役、implementer、済み" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "架空の受け入れ 1、動いている" })).toBeTruthy()
    expect(diagram.textContent).toContain("動いている 1")
    expect(diagram.textContent).toContain("済み 1")
  })

  it("図の列になったフェーズはフェーズの一覧の行に無く、ワークフロースクリプトの行はバックグラウンドタスクの区画に無い", () => {
    const list = openSteps([tasksChanged, progressOf([IMPLEMENTER, reviewer(1)])])

    const rowNames = [...list.querySelectorAll("[data-phase-indexes]")].map(
      (row) => row.querySelector("[class*='work-strip-plan-name']")?.textContent,
    )
    expect(rowNames).toEqual(["架空の計画"])
    expect(list.textContent).toContain("バックグラウンドタスク（1 件）")
    expect(list.textContent).toContain("架空の待ち")
  })

  it("workflowRuns が空なら図を出さず、今の一覧のまま", () => {
    const list = openSteps([tasksChanged])

    expect(screen.queryByRole("region", { name: /の図$/ })).toBeNull()
    expect(list.querySelectorAll("[data-phase-indexes]")).toHaveLength(PHASES.length)
    expect(list.textContent).toContain("バックグラウンドタスク（2 件）")
  })

  it("「ほか n 件」を押すと列の箱が全部出る", () => {
    const reviewers = [1, 2, 3, 4, 5, 6].map(reviewer)
    openSteps([tasksChanged, progressOf([IMPLEMENTER, ...reviewers])])
    const reviewerBoxes = (): number =>
      screen.queryAllByRole("button", { name: /^架空の受け入れ \d、動いている$/ }).length

    const folded = reviewerBoxes()
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "ほか 2 件" }))
    })

    expect(folded).toBe(4)
    expect(reviewerBoxes()).toBe(6)
  })
})
