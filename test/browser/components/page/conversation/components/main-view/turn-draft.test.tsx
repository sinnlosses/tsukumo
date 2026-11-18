import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { REPORT_STEP_ATTRIBUTE } from "../../../../../../../src/browser/components/page/conversation/components/main-view/domain/outline-report-head.ts"
import { REPORT_DRAFT_ATTRIBUTE } from "../../../../../../../src/browser/components/page/conversation/components/main-view/domain/report-heading.ts"
import { useDraftedReports } from "../../../../../../../src/browser/components/page/conversation/stores/drafted-report.ts"
import { saveRevealSpeed } from "../../../../../../../src/browser/domain/reveal-speed.ts"
import type { ReportPending } from "../../../../../../../src/browser/features/report/a2ui-surface-model.ts"
import type {
  MainViewDraft,
  MainViewReportBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { a2uiParts, STAGED_PARTS } from "../../../../../../fixture/a2ui-component.ts"
import { partsDraftOf, SETTLED_DRAFT, WRITING_DRAFT } from "../../../../../../fixture/a2ui-draft.ts"
import { bodyTextOf } from "../../../../../../fixture/main-view-entry.ts"
import {
  reportRecord,
  requestRecord,
  speechRecord,
} from "../../../../../../fixture/session-record.ts"
import { step, TURN_ID, turn, turnBodyText } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

// 本物の `Report`（react-markdown 一式と演出の配線を持つ）ではなく、本文と、骨組みを明滅させるかだけを描く代役に差し替える。
vi.mock("../../../../../../../src/browser/features/report/report.tsx", () => ({
  Report: (props: { readonly body: MainViewReportBody; readonly pending?: ReportPending }) => (
    <div data-report-stub="yes" data-pending-blink={String(props.pending?.blink)}>
      {bodyTextOf(props.body)}
    </div>
  ),
  PendingPaper: (props: { readonly blink: boolean }) => (
    <div data-pending-paper-stub={String(props.blink)} />
  ),
}))

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

const DRAFT_SELECTOR = `[${REPORT_DRAFT_ATTRIBUTE}]`

function renderDraft(draft: MainViewDraft, hasInterimReport = false) {
  putSession(INITIAL_SESSION_STATE)
  return render(
    <Turn turn={{ ...turn([]), hasInterimReport, drafts: [draft] }} newest freshReport={false} />,
  )
}

afterEach(() => {
  cleanup()
  useDraftedReports.setState(useDraftedReports.getInitialState(), true)
})

describe("Turn（report の草稿）", () => {
  const draft = partsDraftOf("toolu_drafted", STAGED_PARTS, WRITING_DRAFT)

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

  it("根がまだ届いていない草稿は、紙の骨組みだけを描く", () => {
    const { container } = renderDraft({ kind: "blank", toolUseId: "toolu_drafted" })

    const paper = container.querySelector(DRAFT_SELECTOR)
    expect(paper?.querySelector("[data-pending-paper-stub]")).not.toBeNull()
    expect(paper?.querySelector("[data-report-stub]")).toBeNull()
    expect(paper?.getAttribute("aria-busy")).toBe("true")
  })

  it("引数を書いている途中の草稿だけ、書いている途中だと読み上げに言う", () => {
    const writing = renderDraft(draft)
    expect(writing.container.querySelector(DRAFT_SELECTOR)?.getAttribute("aria-busy")).toBe("true")
    writing.unmount()

    const settled = renderDraft(partsDraftOf("toolu_drafted", STAGED_PARTS, SETTLED_DRAFT))
    expect(settled.container.querySelector(DRAFT_SELECTOR)?.getAttribute("aria-busy")).toBe("false")
  })

  it("骨組みは明滅させ、演出の速さが「切る」では明滅させない", () => {
    const moving = renderDraft(draft)
    expect(
      moving.container.querySelector("[data-report-stub]")?.getAttribute("data-pending-blink"),
    ).toBe("true")
    moving.unmount()

    saveRevealSpeed("off")
    const still = renderDraft(draft)
    const blank = renderDraft({ kind: "blank", toolUseId: "toolu_blank" })
    localStorage.removeItem("tsukumo-reveal-speed:v1")

    expect(
      still.container.querySelector("[data-report-stub]")?.getAttribute("data-pending-blink"),
    ).toBe("false")
    expect(
      blank.container
        .querySelector("[data-pending-paper-stub]")
        ?.getAttribute("data-pending-paper-stub"),
    ).toBe("false")
  })

  it("見出しの行は最終レポートと同じ条件で出し、終わり方の札は出さない", () => {
    const [root, ...rest] = STAGED_PARTS
    const tasked = partsDraftOf(
      "toolu_drafted",
      a2uiParts(
        { ...root, task: { id: "fictional-task", name: "架空の作業", outcome: "finished" } },
        ...rest,
      ),
      WRITING_DRAFT,
    )

    const plain = renderDraft(draft)
    expect(plain.container.querySelector(`${DRAFT_SELECTOR} > header`)).toBeNull()
    plain.unmount()

    const afterInterim = renderDraft(draft, true)
    expect(afterInterim.container.querySelector(`${DRAFT_SELECTOR} > header`)?.textContent).toBe(
      "書きかけのレポート",
    )
    afterInterim.unmount()

    const head = renderDraft(tasked).container.querySelector(`${DRAFT_SELECTOR} > header`)
    expect(head?.textContent).toContain("fictional-task")
    expect(head?.textContent).toContain("架空の作業")
    expect(head?.textContent).toContain("書きかけのレポート")
    expect(head?.textContent).not.toContain("完了")
  })

  it("ステップがまだ無くても草稿は描き、草稿が外れると面も消える", () => {
    const { container, rerender } = renderDraft(draft)
    expect(container.querySelectorAll(DRAFT_SELECTOR)).toHaveLength(1)

    rerender(<Turn turn={turn([])} newest freshReport={false} />)

    expect(container.querySelectorAll(DRAFT_SELECTOR)).toHaveLength(0)
  })
})
