import { afterEach, describe, expect, it } from "vitest"

import { useWorkStripSteps } from "../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import { checkedTaskId } from "../../../../../fixture/task-id.ts"

afterEach(() => {
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

describe("useWorkStripSteps のフェーズの詳細", () => {
  it("togglePhase で開き、同じ区間をもう一度押すと閉じ、別の区間なら入れ替わる", () => {
    const { togglePhase } = useWorkStripSteps.getState()

    togglePhase(2, "segment-0")
    const opened = useWorkStripSteps.getState().opened
    togglePhase(2, "segment-1")
    const swapped = useWorkStripSteps.getState().opened
    togglePhase(2, "segment-1")
    const closed = useWorkStripSteps.getState().opened

    expect(opened).toEqual({ kind: "phase", exchange: 2, segmentKey: "segment-0" })
    expect(swapped).toEqual({ kind: "phase", exchange: 2, segmentKey: "segment-1" })
    expect(closed).toEqual({ kind: "closed" })
  })

  it("手順の一覧を開く操作（toggle・openAtTop・openAtFailure）でフェーズの詳細は閉じる", () => {
    const state = useWorkStripSteps.getState()

    state.togglePhase(2, "segment-0")
    state.toggle(2)
    const afterToggle = useWorkStripSteps.getState().opened
    state.togglePhase(2, "segment-0")
    state.openAtTop(2)
    const afterTop = useWorkStripSteps.getState().opened
    state.togglePhase(2, "segment-0")
    state.openAtFailure(2)
    const afterFailure = useWorkStripSteps.getState().opened

    expect(afterToggle.kind).toBe("steps")
    expect(afterTop.kind).toBe("steps")
    expect(afterFailure.kind).toBe("steps")
  })

  it("expandDone・expandSteps で畳みを開き、閉じて開き直すと畳んだ姿に戻る", () => {
    const state = useWorkStripSteps.getState()

    state.toggle(2)
    state.expandDone(2)
    state.expandSteps(2)
    const expanded = useWorkStripSteps.getState().opened
    state.closeSteps()
    state.toggle(2)
    const reopened = useWorkStripSteps.getState().opened
    state.expandDone(2)
    state.openAtFailure(2)
    const failure = useWorkStripSteps.getState().opened

    expect(expanded).toMatchObject({ kind: "steps", doneExpanded: true, stepsExpanded: true })
    expect(reopened).toMatchObject({ doneExpanded: false, stepsExpanded: false })
    expect(failure).toMatchObject({ doneExpanded: false, stepsExpanded: false })
  })

  it("ワークフローの図の畳みを開く操作は、閉じて開き直すと畳んだ姿に戻り、別のやり取りには書かない", () => {
    const state = useWorkStripSteps.getState()
    const taskId = checkedTaskId("wf-1")

    state.toggle(2)
    state.unfoldWorkflowPhases(2)
    state.unfoldWorkflowColumn(2, "column-a")
    state.openWorkflowRun(2, taskId)
    state.selectWorkflowAgent(2, taskId, 3)
    state.unfoldWorkflowPhases(5)
    const unfolded = useWorkStripSteps.getState().opened
    state.closeSteps()
    state.toggle(2)
    const reopened = useWorkStripSteps.getState().opened

    expect(unfolded).toMatchObject({
      kind: "steps",
      exchange: 2,
      workflowPhasesUnfolded: true,
      unfoldedWorkflowColumns: ["column-a"],
      openedWorkflowRuns: [taskId],
      selectedWorkflowAgent: { kind: "agent", taskId, index: 3 },
    })
    expect(reopened).toMatchObject({
      workflowPhasesUnfolded: false,
      unfoldedWorkflowColumns: [],
      openedWorkflowRuns: [],
      selectedWorkflowAgent: { kind: "none" },
    })
  })

  it("foldWorkflowPhases は開いた図を畳んだ形へ戻し、ほかの開きは残す", () => {
    const state = useWorkStripSteps.getState()

    state.toggle(2)
    state.unfoldWorkflowPhases(2)
    state.unfoldWorkflowColumn(2, "column-a")
    state.foldWorkflowPhases(5)
    const otherExchange = useWorkStripSteps.getState().opened
    state.foldWorkflowPhases(2)
    const folded = useWorkStripSteps.getState().opened

    expect(otherExchange).toMatchObject({ workflowPhasesUnfolded: true })
    expect(folded).toMatchObject({
      workflowPhasesUnfolded: false,
      unfoldedWorkflowColumns: ["column-a"],
    })
  })

  it("closeSteps は全体の詳細だけを閉じ、フェーズの詳細は触らない", () => {
    const state = useWorkStripSteps.getState()

    state.togglePhase(2, "segment-0")
    state.closeSteps()
    const phaseKept = useWorkStripSteps.getState().opened.kind
    state.toggle(2)
    state.closeSteps()
    const closed = useWorkStripSteps.getState().opened

    expect(phaseKept).toBe("phase")
    expect(closed).toEqual({ kind: "closed" })
  })

  it("togglePhase で手順の一覧は閉じ、closePhase は一覧を触らない", () => {
    const state = useWorkStripSteps.getState()

    state.toggle(2)
    state.togglePhase(2, "segment-0")
    const phase = useWorkStripSteps.getState().opened
    state.closePhase()
    const closed = useWorkStripSteps.getState().opened
    state.toggle(2)
    state.closePhase()
    const stepsKept = useWorkStripSteps.getState().opened.kind

    expect(phase.kind).toBe("phase")
    expect(closed).toEqual({ kind: "closed" })
    expect(stepsKept).toBe("steps")
  })
})
