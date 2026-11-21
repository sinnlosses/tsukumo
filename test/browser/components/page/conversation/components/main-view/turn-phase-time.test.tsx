import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainViewReportBody } from "../../../../../../../src/shared/session/main-view-shape.ts"
import type { SessionEvent } from "../../../../../../../src/shared/session/session-event.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { headOf, SETTLED } from "../../../../../../fixture/main-view-entry.ts"
import { ask, finished, report, turnOf } from "../../../../../../fixture/main-view-report.ts"
import { stubPhoneWidth } from "../../../../../phone-width.ts"
import { putSession } from "../../../../../session-store.ts"

vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody }) => (
    <div data-report-stub="yes" data-phase-times={headOf(props.body)?.status.phaseTimes.kind} />
  ),
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const plan = (current: number, phaseSummary: string): SessionEvent => ({
  kind: "work-plan",
  delegatedRange: { kind: "none" },
  skippedPhases: [],
  awaitingSummary: { kind: "none" },
  phaseIds: [],
  phases: ["架空の段A", "架空の段B"],
  current,
  finishedInGroup: [],
  phaseSummary,
})

function renderFinal(options: { readonly newest: boolean; readonly phone: boolean }): string {
  putSession(INITIAL_SESSION_STATE)
  stubPhoneWidth(options.phone)
  const turn = turnOf(
    [ask, plan(0, ""), plan(1, "架空のまとめ。"), report("架空の結論。"), finished],
    SETTLED,
    true,
  )
  if (turn === undefined) {
    throw new Error("やり取りが無い")
  }
  const { container } = render(<Turn turn={turn} newest={options.newest} freshReport={false} />)
  // 中間レポートも既定で開いて描かれるので、最後の札（最終レポート）を読む。
  const stubs = [...container.querySelectorAll("[data-report-stub]")]
  return stubs.at(-1)?.getAttribute("data-phase-times") ?? ""
}

describe("Turn（所要時間の置き場）", () => {
  it("広い画面の最新のやり取りでは、最終レポートの頭に所要時間を渡さない", () => {
    expect(renderFinal({ newest: true, phone: false })).toBe("none")
  })

  it("狭い画面では最新のやり取りでも所要時間を頭に渡す", () => {
    expect(renderFinal({ newest: true, phone: true })).toBe("times")
  })

  it("過去のやり取りでは所要時間を頭に渡す", () => {
    expect(renderFinal({ newest: false, phone: false })).toBe("times")
  })
})
