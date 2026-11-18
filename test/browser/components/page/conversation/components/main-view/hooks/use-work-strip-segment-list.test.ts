import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useWorkStripSegmentList } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-work-strip-segment-list.ts"
import { useAwaySeam } from "../../../../../../../../src/browser/components/page/conversation/stores/away-seam.ts"
import { mainViewTurnsOf } from "../../../../../../../../src/browser/stores/main-view-turn.ts"
import { useSession } from "../../../../../../../../src/browser/stores/session.ts"
import { foldTimed, plan, workRequest, START } from "../../../../../../../fixture/work-strip.ts"
import { putSession } from "../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  useAwaySeam.setState({ hidden: undefined, away: undefined })
})

const FOUR: typeof plan = { ...plan, phases: ["段A", "段B", "段C", "段D"] }

function stateAt(current: number) {
  return foldTimed([
    [workRequest, START],
    [{ ...FOUR, current }, START + 1_000],
  ])
}

function awayFor(hiddenDoneSegments: number, visibleDoneSegments: number): void {
  const { generation, state } = useSession.getState()
  const turnId = mainViewTurnsOf(state).at(-1)?.id ?? 0
  act(() => {
    useAwaySeam.setState({
      away: {
        generation,
        turnId,
        rowCount: 0,
        hiddenDoneSegments,
        visibleDoneSegments,
        awayMs: 60_000,
      },
    })
  })
}

function segmentsOf(model: ReturnType<typeof useWorkStripSegmentList>) {
  return model.kind === "shown" ? model.segments : []
}

describe("useWorkStripSegmentList", () => {
  it("隠れていたあいだに済んだ区間が unseen になり、次にフェーズが進むと外れる", () => {
    putSession(stateAt(3))
    awayFor(1, 3)
    const { result } = renderHook(() => useWorkStripSegmentList())

    expect(segmentsOf(result.current).map((segment) => segment.unseen)).toEqual([
      false,
      true,
      true,
      false,
    ])

    putSession(stateAt(4))
    awayFor(1, 3)

    expect(segmentsOf(result.current).map((segment) => segment.unseen)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it("付け直した最初の描画では landing を付けず、描画のあいだに済んだ区間にだけ付ける", () => {
    putSession(stateAt(2))
    const { result } = renderHook(() => useWorkStripSegmentList())

    expect(segmentsOf(result.current).some((segment) => segment.landing)).toBe(false)

    putSession(stateAt(3))

    expect(segmentsOf(result.current).map((segment) => segment.landing)).toEqual([
      false,
      false,
      true,
      false,
    ])

    const model = result.current
    act(() => {
      if (model.kind === "shown") {
        model.onLanded("segment-2")
      }
    })

    expect(segmentsOf(result.current).some((segment) => segment.landing)).toBe(false)
  })
})
