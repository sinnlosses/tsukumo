import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useWorkStripPhaseDetail } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-work-strip-phase-detail.ts"
import { useMainViewContent } from "../../../../../../../../src/browser/components/page/conversation/stores/main-view-content.ts"
import { useWorkStripSteps } from "../../../../../../../../src/browser/components/page/conversation/stores/work-strip-step-list.ts"
import { foldTimed, plan, workRequest, START } from "../../../../../../../fixture/work-strip.ts"
import { putSession } from "../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkStripSteps.setState(useWorkStripSteps.getInitialState(), true)
})

function exchangeNow(): number {
  const { content } = useMainViewContent.getState()
  return content.kind === "welcome" ? -1 : content.exchange
}

function putPlan(): void {
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(
    Temporal.Instant.fromEpochMilliseconds(START + 5_000),
  )
  putSession(
    foldTimed([
      [workRequest, START],
      [{ ...plan, current: 1 }, START + 1_000],
    ]),
  )
}

describe("useWorkStripPhaseDetail", () => {
  it("store が今のやり取りの区間を開くと、その区間の中身が出る", () => {
    putPlan()
    const { result } = renderHook(() => useWorkStripPhaseDetail())

    expect(result.current.popup).toEqual({ kind: "closed" })

    act(() => {
      useWorkStripSteps.getState().togglePhase(exchangeNow(), "segment-1")
    })

    expect(result.current.popup).toMatchObject({
      kind: "open",
      segmentKey: "segment-1",
      detail: { name: "架空の段B", state: "current" },
    })
  })

  it("やり取りが替わると閉じて見える", () => {
    putPlan()
    const { result } = renderHook(() => useWorkStripPhaseDetail())

    act(() => {
      useWorkStripSteps.getState().togglePhase(exchangeNow() + 1, "segment-1")
    })
    const otherExchange = result.current.popup
    act(() => {
      useWorkStripSteps.getState().togglePhase(exchangeNow(), "segment-1")
    })

    expect(otherExchange).toEqual({ kind: "closed" })
    expect(result.current.popup.kind).toBe("open")
  })
})
