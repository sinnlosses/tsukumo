import { describe, expect, it } from "bun:test"

import { parseReportChecks, reportChecksMarkdown } from "../../src/shared/report-check.ts"

describe("reportChecksMarkdown", () => {
  it("3つの状態を、色の印（バッジ）と文字の両方で描く", () => {
    const markdown = reportChecksMarkdown([
      { status: "ok", label: "架空の一", detail: "" },
      { status: "ng", label: "架空の二", detail: "" },
      { status: "unverified", label: "架空の三", detail: "" },
    ])

    expect(markdown).toContain('<span class="badge badge-ok">OK</span>')
    expect(markdown).toContain('<span class="badge badge-ng">NG</span>')
    expect(markdown).toContain('<span class="badge badge-warn">未確認</span>')
  })

  it("モデルの文字列は HTML として逃がし、改行は空白に畳む（帯が1行の塊のまま）", () => {
    const markdown = reportChecksMarkdown([
      { status: "ok", label: "<b>架空</b> & 検査", detail: "架空の\n\n件数" },
    ])

    expect(markdown).toContain("<b>&lt;b&gt;架空&lt;/b&gt; &amp; 検査</b> 架空の 件数")
    expect(markdown).not.toContain("\n")
  })

  it("空なら何も描かない", () => {
    expect(reportChecksMarkdown([])).toBe("")
  })
})

describe("parseReportChecks", () => {
  it("無いときと形の崩れたときは空の配列に畳む", () => {
    expect(parseReportChecks(undefined)).toEqual([])
    expect(parseReportChecks([{ status: "skipped", label: "架空", detail: "" }])).toEqual([])
  })
})
