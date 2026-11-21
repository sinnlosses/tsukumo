import { describe, expect, it } from "vitest"

import { REPORT_COMPONENT_SCHEMAS } from "../../../src/shared/report/a2ui-report-catalog.ts"
import type { ReportOutlineLeaf } from "../../../src/shared/report/report-outline.ts"
import { firstTermPlaces } from "../../../src/shared/report/report-term-place.ts"

describe("Report の terms", () => {
  const term = (extra: object = {}) => ({ term: "架空語", note: "架空の注。", ...extra })
  const accepts = (terms: readonly object[]) =>
    REPORT_COMPONENT_SCHEMAS.Report.safeParse({
      id: "root",
      component: "Report",
      children: ["sec"],
      terms,
    }).success

  it("8件・20字の語・80字の注を受ける", () => {
    const eight = Array.from({ length: 8 }, (_, index) => term({ term: `語${String(index)}` }))
    expect(accepts(eight)).toBe(true)
    expect(accepts([term({ term: "あ".repeat(20), note: "い".repeat(80) })])).toBe(true)
  })

  it("9件・21字の語・81字の注・改行のある語と注・空の語・空の一覧を拒む", () => {
    const nine = Array.from({ length: 9 }, (_, index) => term({ term: `語${String(index)}` }))
    expect(accepts(nine)).toBe(false)
    expect(accepts([term({ term: "あ".repeat(21) })])).toBe(false)
    expect(accepts([term({ note: "い".repeat(81) })])).toBe(false)
    expect(accepts([term({ term: "架空\n語" })])).toBe(false)
    expect(accepts([term({ note: "架空\nの注" })])).toBe(false)
    expect(accepts([term({ term: "" })])).toBe(false)
    expect(accepts([])).toBe(false)
  })
})

describe("firstTermPlaces", () => {
  const paragraph = (id: string, text: string): ReportOutlineLeaf => ({
    id,
    component: "Paragraph",
    text,
    fold: "",
    aside: "",
  })
  const terms = [{ term: "架空語", note: "架空の注。" }]

  it("並びの順で最初に語が出た部品と欄の字を選ぶ", () => {
    const places = firstTermPlaces(terms, [
      paragraph("p1", "語の無い文。"),
      paragraph("p2", "架空語の文。"),
      paragraph("p3", "また架空語。"),
    ])
    expect(places.get("架空語")).toEqual({ leafId: "p2", text: "架空語の文。" })
  })

  it("inline code・リンク・印の中の語は数えない", () => {
    const places = firstTermPlaces(terms, [
      paragraph("p1", "`架空語` の文。"),
      paragraph("p2", "[架空語](https://example.com/) の文。"),
      paragraph("p3", "差は {{架空語 → 8}} の文。"),
      paragraph("p4", "外の架空語。"),
    ])
    expect(places.get("架空語")?.leafId).toBe("p4")
  })

  it("どこにも無い語は入らない", () => {
    expect(firstTermPlaces(terms, [paragraph("p1", "`架空語`")]).size).toBe(0)
  })
})
