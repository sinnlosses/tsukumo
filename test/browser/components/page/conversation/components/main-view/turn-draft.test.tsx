import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { REPORT_STEP_ATTRIBUTE } from "../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-report-head.ts"
import { REPORT_DRAFT_ATTRIBUTE } from "../../../../../../../src/browser/components/page/conversation/components/main-view/domain/report-heading.ts"
import { useDraftedReports } from "../../../../../../../src/browser/components/page/conversation/stores/drafted-report.ts"
import { mainViewDraftOf } from "../../../../../../../src/browser/domain/main-view/a2ui-draft-view.ts"
import type { MainViewReportBody } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { STAGED_PARTS } from "../../../../../../fixture/a2ui-component.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import { step, turn, turnBodyText } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、本文だけを描く代役に差し替える。
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

afterEach(() => {
  cleanup()
  useDraftedReports.setState(useDraftedReports.getInitialState(), true)
})

describe("Turn（report の草稿）", () => {
  const draft = mainViewDraftOf("toolu_drafted", STAGED_PARTS)
  if (draft === undefined) {
    throw new Error("根のある一覧から草稿が作れなかった")
  }

  it("ステップの後ろに草稿の面を描き、目次が拾う印は付けない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={{
          ...turn([step({ id: 0, body: turnBodyText("中間"), interim: true })]),
          drafts: [draft],
        }}
        newest
        freshReport={false}
      />,
    )

    const sections = [...container.querySelectorAll("section")]
    expect(sections).toHaveLength(2)
    expect(sections[1]?.hasAttribute(REPORT_DRAFT_ATTRIBUTE)).toBe(true)
    expect(sections[1]?.hasAttribute(REPORT_STEP_ATTRIBUTE)).toBe(false)
    expect(sections[1]?.textContent).toContain("架空の結論。")
  })

  it("ステップがまだ無くても草稿は描き、草稿が外れると面も消える", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container, rerender } = render(
      <Turn turn={{ ...turn([]), drafts: [draft] }} newest freshReport={false} />,
    )
    expect(container.querySelectorAll(`[${REPORT_DRAFT_ATTRIBUTE}]`)).toHaveLength(1)

    rerender(<Turn turn={turn([])} newest freshReport={false} />)

    expect(container.querySelectorAll(`[${REPORT_DRAFT_ATTRIBUTE}]`)).toHaveLength(0)
  })
})
