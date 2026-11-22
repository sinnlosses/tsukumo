import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { WorkStrip } from "../../../../../../../src/browser/components/page/conversation/components/main-view/work-strip.tsx"
import { useWorkStripSteps } from "../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import type { BackgroundTask } from "../../../../../../../src/shared/session-driver/background-task.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import type { WorkflowAgent } from "../../../../../../../src/shared/session/workflow-step.ts"
import { requestEvent } from "../../../../../../fixture/session-event.ts"
import { checkedTaskId } from "../../../../../../fixture/task-id.ts"
import { checkedToolUseId } from "../../../../../../fixture/tool-use-id.ts"
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
      (row) => row.closest("li")?.querySelector("span[data-progress]")?.textContent,
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

const stepStarted = (agentId: string, toolUseId: string, path: string): SessionEvent => ({
  kind: "workflow-step-started",
  agentId,
  toolUseId: checkedToolUseId(toolUseId),
  name: "Read",
  input: { file_path: path },
})

describe("WorkStrip のワークフローの図の手元", () => {
  const withModel = (agent: WorkflowAgent): WorkflowAgent => ({
    ...agent,
    agentType: "fake:implementer",
    model: "sonnet",
  })

  it("走っているエージェントの手元が図の下に出て、頭に種類の全名とモデルが付く", () => {
    openSteps([
      tasksChanged,
      progressOf([IMPLEMENTER, withModel(reviewer(1))]),
      stepStarted("agent-1", "tu-1", "/架空/a.ts"),
    ])

    const hand = screen.getByRole("region", { name: "架空の受け入れ 1 の手元" })
    expect(hand.textContent).toContain("fake:implementer · sonnet")
    expect(hand.textContent).toContain("/架空/a.ts")
    expect(
      screen
        .getByRole("button", { name: "架空の受け入れ 1、implementer、動いている" })
        .getAttribute("aria-pressed"),
    ).toBe("true")
  })

  it("種類の無いエージェントの手元は「既定のエージェント」と言い、申し送りの行は出さない", () => {
    openSteps([tasksChanged, progressOf([reviewer(1)])])

    const hand = screen.getByRole("region", { name: "架空の受け入れ 1 の手元" })
    expect(hand.textContent).toContain("既定のエージェント")
    expect(hand.textContent).not.toContain("申し送り")
  })

  it("箱を押すと、そのエージェントの手元に替わる", () => {
    openSteps([tasksChanged, progressOf([IMPLEMENTER, reviewer(1)])])
    expect(screen.queryByRole("region", { name: "架空の実装役 の手元" })).toBeNull()

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "架空の実装役、implementer、済み" }))
    })

    expect(screen.getByRole("region", { name: "架空の実装役 の手元" })).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "架空の実装役、implementer、済み" })
        .getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      screen
        .getByRole("button", { name: "架空の受け入れ 1、動いている" })
        .getAttribute("aria-pressed"),
    ).toBe("false")
  })

  it("手順が5件以上なら直近4件だけを出し、「すべて見る」で全部を同じ面に開く", () => {
    const steps = [1, 2, 3, 4, 5, 6].map((n) =>
      stepStarted("agent-1", `tu-${String(n)}`, `/架空/${String(n)}.ts`),
    )
    openSteps([tasksChanged, progressOf([IMPLEMENTER, reviewer(1)]), ...steps])
    const hand = screen.getByRole("region", { name: "架空の受け入れ 1 の手元" })
    expect(hand.textContent).not.toContain("/架空/1.ts")
    expect(hand.textContent).toContain("/架空/6.ts")

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "手順 6件をすべて見る" }))
    })

    expect(hand.textContent).toContain("/架空/1.ts")
  })

  it("失敗したエージェントがいるときだけ、閉じた「手順」の口に赤い点が付く", () => {
    const failed: WorkflowAgent = { ...reviewer(1), state: "error", stopReason: "failed" }
    putSession(stateAfter([requestEvent(), workPlan, tasksChanged, progressOf([failed])]))
    render(<WorkStrip />)
    expect(screen.getByRole("button", { name: /失敗したエージェントがある/ })).toBeTruthy()
    cleanup()

    putSession(stateAfter([requestEvent(), workPlan, tasksChanged, progressOf([reviewer(1)])]))
    render(<WorkStrip />)
    expect(screen.queryByRole("button", { name: /失敗したエージェントがある/ })).toBeNull()
  })
})
