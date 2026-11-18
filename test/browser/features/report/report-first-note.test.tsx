// レポートの初回の説明（検証の語）が、レポートの中に出て、「分かった」で次から出ないこと。

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

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

const COMMAND = "pnpm run fictional-check"

function parts(command: string): readonly unknown[] {
  return [
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
          command,
          detail: "",
          howToVerify: "",
          supports: ["s1"],
        },
      ],
    },
    { id: "s1", component: "Section", heading: "架空の一", children: ["p1"] },
    { id: "p1", component: "Markdown", markdown: "架空の一の段落。" },
  ]
}

/** `recorded` なら、検証の行のコマンドを同じやり取りで打ち終えた Bash の記録を先に置く。 */
function regions(recorded: boolean): MainViewReportRegions {
  const started = applySessionEvent(
    INITIAL_SESSION_STATE,
    {
      kind: "tool-started",
      toolUseId: checkedToolUseId("toolu_bash"),
      name: "Bash",
      input: { command: COMMAND },
      parentToolUseId: undefined,
    },
    0,
  )
  const bash = applySessionEvent(
    started,
    {
      kind: "tool-finished",
      toolUseId: checkedToolUseId("toolu_bash"),
      content: "架空の出力",
      isError: false,
    },
    1000,
  )
  const before = recorded ? bash : INITIAL_SESSION_STATE
  const [event] = reportEvents(
    checkedToolUseId("toolu_fictional"),
    { components: parts(recorded ? COMMAND : "") },
    [],
  )
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(before, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

function renderReport(body = regions(true)): HTMLElement {
  return render(<Report reveal={false} turnId={1} {...NO_CLASS_NAMES} body={body} />).container
}

describe("レポートの初回の説明", () => {
  it("検証の語の説明が、レポート本文の中に1つだけ出る", () => {
    const container = renderReport()
    const body = container.querySelector("[data-report-body]")

    expect(body?.querySelector('[data-first-note="report-terms"]')?.textContent).toMatch(TERMS_TEXT)
    expect(body?.querySelectorAll("[data-first-note]")).toHaveLength(1)
  })

  it("「分かった」を押した説明は消え、端末の好みへ残る", () => {
    renderReport()
    fireEvent.click(screen.getByRole("button", { name: "分かった" }))

    expect(screen.queryByText(TERMS_TEXT)).toBeNull()
    expect(JSON.parse(localStorage.getItem("tsukumo-first-note-seen:v1") ?? "[]")).toEqual([
      "report-terms",
    ])
  })

  it("照らせた行が無いレポートには、説明する印が無いので説明も出さない", () => {
    renderReport(regions(false))

    expect(screen.queryByText(TERMS_TEXT)).toBeNull()
  })

  it("見たことのある説明は、描き直しても出ない", () => {
    useFirstNoteSeen.setState({ seen: ["report-terms"] })
    renderReport()

    expect(screen.queryByText(TERMS_TEXT)).toBeNull()
  })
})
