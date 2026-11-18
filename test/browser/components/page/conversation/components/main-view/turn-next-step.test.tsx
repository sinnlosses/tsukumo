import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useNextStepTray } from "../../../../../../../src/browser/components/page/conversation/stores/next-step-tray.ts"
import type {
  MainViewReportBody,
  MainViewStep,
  MainViewStepBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { bodyTextOf, noRootA2ui } from "../../../../../../fixture/main-view-entry.ts"
import { step, TURN_ID, turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、本文だけを描く代役に差し替える。
vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody }) => (
    <div data-report-stub="yes">{bodyTextOf(props.body)}</div>
  ),
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
  useNextStepTray.setState(useNextStepTray.getInitialState(), true)
})

describe("Turn（次の一手の並びへ載せる）", () => {
  function reportStep(id: number, mark: MainViewStep["mark"]): MainViewStep {
    const body: MainViewStepBody = {
      kind: "text",
      report: { kind: "regions", sections: [], a2ui: noRootA2ui(`架空の本文${String(id)}`) },
      firstLine: `架空の本文${String(id)}`,
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
      sessionRemaining: { kind: "remaining", text: "架空の残り" },
    }
    return step({ id, body, mark })
  }

  const steps = [reportStep(0, "interim-kept"), reportStep(1, "final")]

  it("いちばん新しいやり取りの最終レポートの次の一手だけが並びに載り、外れると降りる", () => {
    putSession(INITIAL_SESSION_STATE)
    const { unmount } = render(<Turn turn={turn(steps)} newest freshReport={false} />)

    expect(useNextStepTray.getState().reportKey).toBe(`${String(TURN_ID)}:1`)
    expect(useNextStepTray.getState().steps.map((next) => next.kind)).toEqual(["continue"])

    unmount()
    expect(useNextStepTray.getState().reportKey).toBeUndefined()
  })

  it("過去のやり取りでは並びに載らない", () => {
    putSession(INITIAL_SESSION_STATE)
    render(<Turn turn={turn(steps)} newest={false} freshReport={false} />)

    expect(useNextStepTray.getState().reportKey).toBeUndefined()
  })
})
