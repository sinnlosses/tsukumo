import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { REPORT_STEP_ATTRIBUTE } from "../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-report-head.ts"
import {
  DRAFT_SLOT_ATTRIBUTE,
  REPORT_DRAFT_ATTRIBUTE,
} from "../../../../../../../src/browser/components/page/conversation/components/main-view/domain/report-heading.ts"
import { useDraftedReports } from "../../../../../../../src/browser/components/page/conversation/stores/drafted-report.ts"
import { mainViewDraftOf } from "../../../../../../../src/browser/domain/main-view/a2ui-draft-view.ts"
import { saveRevealSpeed } from "../../../../../../../src/browser/domain/reveal-speed.ts"
import type { MainViewReportBody } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { STAGED_PARTS } from "../../../../../../fixture/a2ui-component.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import {
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { step, TURN_ID, turn, turnBodyText } from "../../../../../../fixture/turn.ts"
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
  useDraftedReports.setState(useDraftedReports.getInitialState(), true)
})

describe("Turn（report の草稿）", () => {
  const draft = mainViewDraftOf("toolu_drafted", STAGED_PARTS, [])
  if (draft === undefined) {
    throw new Error("根のある一覧から草稿が作れなかった")
  }

  it("ステップの後ろに草稿の面を描き、目次が拾う印は付けない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container } = render(
      <Turn
        turn={{
          ...turn([step({ id: 0, body: turnBodyText("中間"), mark: "interim-kept" })]),
          drafts: [draft],
        }}
        newest
        freshReport={false}
      />,
    )

    const sections = [...container.querySelectorAll("section")]
    expect(sections).toHaveLength(2)
    expect(sections[0]?.hasAttribute(REPORT_STEP_ATTRIBUTE)).toBe(true)
    expect(sections[1]?.hasAttribute(REPORT_DRAFT_ATTRIBUTE)).toBe(true)
    expect(sections[1]?.hasAttribute(REPORT_STEP_ATTRIBUTE)).toBe(false)
    expect(sections[1]?.textContent).toContain("架空の結論。")
  })

  it("締めのセリフの場所は草稿の前に1つだけ押さえ、草稿が無ければ出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container, rerender } = render(
      <Turn turn={{ ...turn([]), drafts: [draft, draft] }} newest freshReport={false} />,
    )
    const slots = container.querySelectorAll("[data-closing-slot]")
    expect(slots).toHaveLength(1)
    expect(slots[0]?.nextElementSibling?.hasAttribute(REPORT_DRAFT_ATTRIBUTE)).toBe(true)

    rerender(
      <Turn
        turn={turn([step({ id: 0, body: turnBodyText("中間"), mark: "interim-kept" })])}
        newest
        freshReport={false}
      />,
    )
    expect(container.querySelector("[data-closing-slot]")).toBeNull()
  })

  it("締めのセリフがあとから届いても、紙は作り直さない", () => {
    const finalTurn = turn([
      step({
        id: 3,
        body: turnBodyText("最終"),
        origin: { kind: "tool-report", toolUseId: "fictional-report" },
        mark: "final",
      }),
    ])
    putSession({
      ...INITIAL_SESSION_STATE,
      records: [requestRecord({ turnId: TURN_ID }), reportRecord("最終")],
    })
    const { container, rerender } = render(<Turn turn={finalTurn} newest freshReport={false} />)
    const paper = container.querySelector("[data-report-stub]")
    expect(paper).not.toBeNull()

    putSession({
      ...INITIAL_SESSION_STATE,
      records: [
        requestRecord({ turnId: TURN_ID }),
        reportRecord("最終"),
        speechRecord({ text: "締め" }),
      ],
    })
    rerender(<Turn turn={finalTurn} newest freshReport={false} />)

    expect(container.textContent).toContain("締め")
    expect(container.querySelector("[data-report-stub]")).toBe(paper)
  })

  it("次の部品を待つあいだは草稿の末尾に罫線の欄を出し、演出の速さが「切る」では出さない", () => {
    putSession(INITIAL_SESSION_STATE)
    const { container, unmount } = render(
      <Turn turn={{ ...turn([]), drafts: [draft] }} newest freshReport={false} />,
    )
    expect(
      container.querySelector(`[${REPORT_DRAFT_ATTRIBUTE}] > [${DRAFT_SLOT_ATTRIBUTE}]`),
    ).not.toBeNull()
    unmount()

    saveRevealSpeed("off")
    const off = render(<Turn turn={{ ...turn([]), drafts: [draft] }} newest freshReport={false} />)
    localStorage.removeItem("tsukumo-reveal-speed:v1")

    expect(off.container.querySelector(`[${DRAFT_SLOT_ATTRIBUTE}]`)).toBeNull()
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
