import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Report } from "../../../../src/browser/features/report/report.tsx"
import { regionsOfInput } from "../../../fixture/report-region.ts"

afterEach(() => {
  cleanup()
})

const NO_CLASS_NAMES = { className: "", revealClassName: "", blockClassName: "" }

const PROOF_CHECK = {
  status: "ng",
  label: "架空の検証",
  figure: "",
  command: "",
  detail: "",
  howToVerify: "",
}

function partsWith(root: Readonly<Record<string, unknown>>) {
  return [
    {
      id: "root",
      component: "Report",
      conclusion: ["架空の結論。"],
      children: ["s1", "s2"],
      ...root,
    },
    { id: "s1", component: "Section", heading: "架空の一", children: ["p1"] },
    { id: "p1", component: "Markdown", markdown: "架空の一の段落。" },
    { id: "s2", component: "Section", heading: "架空の二", children: ["p2"] },
    { id: "p2", component: "Markdown", markdown: "架空の二の段落。" },
  ]
}

function renderProof(root: Readonly<Record<string, unknown>>): HTMLElement {
  const body = regionsOfInput({ components: partsWith(root) })
  return render(<Report reveal={false} turnId={1} {...NO_CLASS_NAMES} body={body} />).container
}

describe("節の末尾の印とやっていないことの欄", () => {
  it("検証の行が結ばれた節の末尾に印が出て、結ばれていない節には出ない", () => {
    const container = renderProof({ checks: [{ ...PROOF_CHECK, supports: ["s1"] }] })

    const sections = [...container.querySelectorAll("[data-report-section]")]
    expect(sections).toHaveLength(2)
    expect(sections[0]?.textContent).toContain("✕ 落ちた")
    expect(sections[1]?.querySelector("[data-proof]")).toBeNull()
  })

  it("supports を持たないレポートの節に印は出ない", () => {
    const container = renderProof({ checks: [PROOF_CHECK] })

    for (const section of container.querySelectorAll("[data-report-section]")) {
      expect(section.querySelector("[data-proof]")).toBeNull()
    }
  })

  it("notDone は空で「無い」、中身ありで一覧、省くと欄が無い", () => {
    const empty = renderProof({ notDone: [] })
    expect(empty.querySelector('[data-report-region="not-done"]')?.textContent).toContain("無い")
    cleanup()

    const listed = renderProof({ notDone: ["架空の見送り一", "架空の見送り二"] })
    const region = listed.querySelector('[data-report-region="not-done"]')
    expect(region?.querySelectorAll("li")).toHaveLength(2)
    expect(region?.textContent).toContain("やっていないこと")
    cleanup()

    const omitted = renderProof({})
    expect(omitted.querySelector('[data-report-region="not-done"]')).toBeNull()
  })

  it("やっていないことの欄は節のあと・お願いの前に置かれる", () => {
    const container = renderProof({ notDone: ["架空の見送り"], favor: "架空のお願い。" })

    const order = [...container.querySelectorAll("[data-report-region]")].map((el) =>
      el.getAttribute("data-report-region"),
    )
    expect(order.indexOf("not-done")).toBeGreaterThan(order.lastIndexOf("section"))
    expect(order.indexOf("not-done")).toBeLessThan(order.indexOf("favor"))
  })
})
