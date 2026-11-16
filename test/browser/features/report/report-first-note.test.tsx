// レポートの初回の説明（検証の語・余白の案内）が、レポートの中に出て、「分かった」で次から出ないこと。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  type ReplyPort,
  ReplyPortContext,
} from "../../../../src/browser/features/report/reply-port.ts"
import { Report } from "../../../../src/browser/features/report/report.tsx"
import { useFirstNoteSeen } from "../../../../src/browser/stores/first-note-seen.ts"
import { reportEvents } from "../../../../src/server/session-driver/core/message/sdk-report-message.ts"
import { mainViewEntries } from "../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../src/shared/session/session-state.ts"
import { checkedToolUseId } from "../../../fixture/tool-use-id.ts"

afterEach(() => {
  cleanup()
  localStorage.clear()
  useFirstNoteSeen.setState({ seen: [] })
})

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const TERMS_TEXT = /「記録あり」は実行の記録と照合できた確認/
const MARGIN_TEXT = /「聞く・頼む」が出る/

const PARTS = [
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    children: ["s1"],
    checks: [
      {
        status: "ok",
        label: "架空の検証",
        figure: "",
        command: "",
        detail: "",
        howToVerify: "",
        supports: ["s1"],
      },
    ],
  },
  { id: "s1", component: "Section", heading: "架空の一", children: ["p1"] },
  { id: "p1", component: "Markdown", markdown: "架空の一の段落。" },
]

function regions(): MainViewReportRegions {
  const [event] = reportEvents(checkedToolUseId("toolu_fictional"), { components: PARTS }, [])
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function renderReport(): HTMLElement {
  const port: ReplyPort = {
    ask: vi.fn<ReplyPort["ask"]>(),
    appendDraft: vi.fn<ReplyPort["appendDraft"]>(),
    prependDraft: vi.fn<ReplyPort["prependDraft"]>(),
  }
  return render(
    <ReplyPortContext value={{ kind: "open", port }}>
      <Report reveal={false} turnId={1} {...NO_CLASS_NAMES} body={regions()} />
    </ReplyPortContext>,
  ).container
}

describe("レポートの初回の説明", () => {
  it("検証の語と余白の案内が、レポート本文の中に出る", () => {
    const container = renderReport()
    const body = container.querySelector("[data-report-body]")

    expect(body?.querySelector('[data-first-note="report-terms"]')?.textContent).toMatch(TERMS_TEXT)
    expect(body?.querySelector('[data-first-note="reply-margin"]')?.textContent).toMatch(
      MARGIN_TEXT,
    )
  })

  it("「分かった」を押した説明は消え、端末の好みへ残り、もう一方は残る", () => {
    renderReport()
    const [first] = screen.getAllByRole("button", { name: "分かった" })
    if (first === undefined) throw new Error("「分かった」が無い")
    fireEvent.click(first)

    expect(screen.queryByText(TERMS_TEXT)).toBeNull()
    expect(screen.getByText(MARGIN_TEXT)).toBeTruthy()
    expect(JSON.parse(localStorage.getItem("tsukumo-first-note-seen:v1") ?? "[]")).toEqual([
      "report-terms",
    ])
  })

  it("見たことのある説明は、描き直しても出ない", () => {
    useFirstNoteSeen.setState({ seen: ["report-terms", "reply-margin"] })
    renderReport()

    expect(screen.queryByText(TERMS_TEXT)).toBeNull()
    expect(screen.queryByText(MARGIN_TEXT)).toBeNull()
  })
})
