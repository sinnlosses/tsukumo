import { describe, expect, it } from "vitest"

import { parseReportChecks, type ReportCheck } from "../../../src/shared/report/report-check.ts"

const check = (
  status: ReportCheck["status"],
  label: string,
  fields: Partial<Omit<ReportCheck, "status" | "label">> = {},
): ReportCheck => ({
  status,
  label,
  figure: "",
  command: "",
  detail: "",
  howToVerify: "",
  ...fields,
})

describe("parseReportChecks", () => {
  it("無いときと形の崩れたときは空の配列に畳む", () => {
    expect(parseReportChecks(undefined)).toEqual([])
    expect(parseReportChecks([{ status: "skipped", label: "架空", detail: "" }])).toEqual([])
  })

  it("figure・command・howToVerify の無い前の形の記録は、3つを空文字にして読む", () => {
    expect(parseReportChecks([{ status: "ok", label: "架空", detail: "架空の件数" }])).toEqual([
      check("ok", "架空", { detail: "架空の件数" }),
    ])
  })

  it("状態が unverified の前の形の記録は unobserved として読む", () => {
    expect(
      parseReportChecks([{ status: "unverified", label: "架空", detail: "架空の理由" }]),
    ).toEqual([check("unobserved", "架空", { detail: "架空の理由" })])
  })

  it("howToVerify があれば残す", () => {
    const stored = check("unobserved", "架空", {
      detail: "架空の理由",
      howToVerify: "架空の窓を開いて見る",
    })

    expect(parseReportChecks([stored])).toEqual([stored])
  })
})
