import { describe, expect, it } from "vitest"

import {
  a2uiReportComponentSchema,
  a2uiWrittenComponentSchema,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../src/shared/report/a2ui-report-catalog.ts"

describe("Report の sources", () => {
  const source = (extra: object = {}) => ({
    id: "s1",
    title: "架空の出典",
    url: "https://example.com/a",
    ...extra,
  })
  const accepts = (sources: readonly object[]) =>
    REPORT_COMPONENT_SCHEMAS.Report.safeParse({
      id: "root",
      component: "Report",
      children: ["sec"],
      sources,
    }).success

  it("1件の正しい出典を受ける", () => {
    expect(accepts([source()])).toBe(true)
    expect(accepts([source({ url: "http://example.com/" })])).toBe(true)
  })

  it("11件・61字の題・改行のある題・ftp の URL・形に当たらない id・空の一覧を拒む", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => source({ id: `s${String(index)}` }))
    expect(accepts(eleven)).toBe(false)
    expect(accepts([source({ title: "あ".repeat(61) })])).toBe(false)
    expect(accepts([source({ title: "架空\n二行" })])).toBe(false)
    expect(accepts([source({ url: "ftp://example.com/a" })])).toBe(false)
    expect(accepts([source({ id: "S1" })])).toBe(false)
    expect(accepts([source({ id: "a".repeat(17) })])).toBe(false)
    expect(accepts([])).toBe(false)
  })

  it("読み戻しの形も同じ欄を受ける", () => {
    const report = { id: "root", component: "Report", children: ["sec"], sources: [source()] }
    const broken = { ...report, sources: [source({ id: "S" })] }
    expect(a2uiWrittenComponentSchema.safeParse(report).success).toBe(true)
    expect(a2uiReportComponentSchema.safeParse(report).success).toBe(true)
    expect(a2uiReportComponentSchema.safeParse(broken).success).toBe(false)
  })
})
