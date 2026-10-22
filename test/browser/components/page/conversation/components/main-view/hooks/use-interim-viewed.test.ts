import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useInterimViewed } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-interim-viewed.ts"
import { useInterimViewing } from "../../../../../../../../src/browser/stores/interim-viewing.ts"
import { useSession } from "../../../../../../../../src/browser/stores/session.ts"
import type {
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../../src/shared/session/main-view-shape.ts"

const INTERIM_STEP: MainViewStep = {
  id: 0,
  body: {
    kind: "text",
    report: {
      kind: "regions",
      head: "",
      finalHead: "",
      sections: [{ id: 0, heading: "一", markdown: "## 一" }],
      retrospective: "",
      favor: { id: "favor-toolu_fictional", markdown: "" },
    },
    firstLine: "",
    task: { kind: "none" },
    finishedPhase: { kind: "none" },
    changeSummary: { kind: "none" },
  },
  interim: true,
  superseded: false,
  final: false,
  actions: [],
  asides: [],
}

const TURN: MainViewTurn = {
  id: 4,
  request: undefined,
  steps: [INTERIM_STEP],
  hasInterimReport: true,
  droppedCount: 0,
  failure: { kind: "none" },
}

afterEach(() => {
  cleanup()
  useInterimViewing.setState(useInterimViewing.getInitialState(), true)
})

describe("useInterimViewed", () => {
  it("働いているあいだに中間を出していれば覚え、閉じたやり取りは覚えない", () => {
    renderHook(() => {
      useInterimViewed(TURN, false)
    })
    expect(useInterimViewing.getState().viewed[4]).toBeUndefined()

    renderHook(() => {
      useInterimViewed(TURN, true)
    })
    expect(useInterimViewing.getState().viewed[4]).toBe(true)
  })

  it("画面を隠して戻しても覚えは残り、セッションの世代が変わったら捨てる", () => {
    const first = renderHook(() => {
      useInterimViewed(TURN, true)
    })
    first.unmount()

    renderHook(() => {
      useInterimViewed(undefined, false)
    })
    expect(useInterimViewing.getState().viewed[4]).toBe(true)

    act(() => {
      useSession.setState((current) => ({ generation: current.generation + 1 }))
    })
    expect(useInterimViewing.getState().viewed[4]).toBeUndefined()
  })
})
