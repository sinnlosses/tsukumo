import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { Report } from "../../../../../../../src/browser/components/page/conversation/components/main-view/report.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { reportEvents } from "../../../../../../../src/server/session-driver/core/sdk-report-message.ts"
import { mainViewEntries } from "../../../../../../../src/shared/session/main-view-entry.ts"
import type { MainViewReportRegions } from "../../../../../../../src/shared/session/main-view-shape.ts"
import { applySessionEvent } from "../../../../../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { normalized, textNodesOf } from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

const VERDICT = '[role="group"][aria-label="検証結果"]'

const check = (status: string, label: string, fields: Readonly<Record<string, string>> = {}) => ({
  status,
  label,
  figure: "",
  command: "",
  detail: "",
  howToVerify: "",
  ...fields,
})

const MIXED = [
  check("ok", "架空の単体（全件）", { figure: "単体 12" }),
  check("ng", "架空の E2E", { figure: "3 件中 1 件", detail: "架空の1件が落ちた" }),
  check("blocked", "架空の夜間", { detail: "架空の前提が止まっている" }),
  check("unobserved", "架空の狭い窓", {
    detail: "手で確かめていない",
    howToVerify: "架空の窓を開いて帯を見る",
  }),
  check("ok", "架空の型"),
]

function regionsOf(checks: readonly unknown[], favor: string): MainViewReportRegions {
  const [event] = reportEvents(
    "toolu_fictional",
    {
      components: [
        {
          id: "root",
          component: "Report",
          conclusion: ["架空の結論。"],
          children: ["p1"],
          checks,
          favor,
        },
        { id: "p1", component: "Markdown", markdown: "架空の段落。" },
      ],
    },
    [],
  )
  if (event?.kind !== "report") throw new Error("report にならなかった")
  const entry = mainViewEntries(applySessionEvent(INITIAL_SESSION_STATE, event, 0)).find(
    (candidate) => candidate.kind === "report",
  )
  if (entry?.kind !== "report") throw new Error("レポートの記録が無い")
  return entry.regions
}

/** 合図の行の包み（`status`）を描いた DOM。 */
function verdictOf(body: MainViewReportRegions) {
  const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)
  const wrapper = container.querySelector(VERDICT)?.parentElement
  if (wrapper === null || wrapper === undefined) throw new Error("合図の行が無い")
  const rendered = { html: normalized(wrapper.outerHTML), textNodes: textNodesOf(wrapper) }
  cleanup()
  return rendered
}

describe("ChecksVerdict（面の合図の行）", () => {
  it.each([
    ["4 状態を混ぜた検証", MIXED, ""],
    ["通った項目だけ", [check("ok", "架空の単体")], ""],
    ["問題の項目だけ", [check("ng", "架空の E2E", { detail: "架空の理由" })], ""],
    ["お願いのある検証", MIXED, "架空のお願い。"],
  ])("%s は、面の値から合図の行の包みを描く", (_, checks, favor) => {
    const surface = regionsOf(checks, favor)
    expect(surface.a2ui.kind).toBe("surface")

    const fresh = verdictOf(surface)

    expect(fresh.html).toContain("架空の")
    expect(fresh.textNodes.length).toBeGreaterThan(0)
  })

  it("お願いの印を押すと、location.hash を書かずにお願いの欄へ転がす", () => {
    const body = regionsOf(MIXED, "架空のお願い。")
    const { container } = render(<Report reveal={false} turnId={1} className="" body={body} />)
    const favor = container.querySelector(`[id="${body.favor.id}"]`)
    if (!(favor instanceof HTMLElement)) throw new Error("お願いの欄が無い")
    const scrolled = vi.fn<(options?: ScrollIntoViewOptions | boolean) => void>()
    favor.scrollIntoView = scrolled
    const link = container.querySelector(`${VERDICT} a`)
    if (link === null) throw new Error("お願いの印が無い")
    const before = window.location.hash

    fireEvent.click(link)

    expect(scrolled).toHaveBeenCalledWith({ block: "start" })
    expect(window.location.hash).toBe(before)
  })
})
