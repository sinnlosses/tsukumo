import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  MainViewReportBody,
  MainViewStepBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import { step, turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/main-view/report.tsx",
  () => ({
    Report: (props: { readonly body: MainViewReportBody }) => (
      <div data-report-stub="yes">{bodyTextOf(props.body)}</div>
    ),
  }),
)

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(cleanup)

describe("Turn（最終レポートの「広げる」）", () => {
  const body: MainViewStepBody = {
    kind: "text",
    report: { kind: "markdown", markdown: "架空の本文" },
    firstLine: "架空の本文",
    task: { kind: "task", id: "X-7", name: "架空の作業", outcome: "finished", genre: "work" },
    finishedPhase: { kind: "none" },
    changeSummary: { kind: "none" },
  }

  it("最終レポートには「広げる」が出て、押すと板が開き、「閉じる」で閉じる", () => {
    putSession(INITIAL_SESSION_STATE)
    render(<Turn turn={turn([step({ id: 0, body, mark: "final" })])} newest freshReport={false} />)

    fireEvent.click(screen.getByRole("button", { name: "広げる" }))

    expect(document.querySelectorAll("[data-report-stub]")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "閉じる", hidden: true }))
    expect(document.querySelectorAll("[data-report-stub]")).toHaveLength(1)
  })

  it("中間レポートには「広げる」が出ない", () => {
    putSession(INITIAL_SESSION_STATE)
    render(
      <Turn
        turn={turn([step({ id: 0, body, mark: "interim-kept" })])}
        newest
        freshReport={false}
      />,
    )

    expect(screen.queryByRole("button", { name: "広げる", hidden: true })).toBeNull()
  })
})
