import { describe, expect, it } from "vitest"

import { buildReportExportDocument } from "../../../../../src/server/report/core/export/report-export-document.ts"
import { reportExportFileName } from "../../../../../src/server/report/core/export/report-export-file-name.ts"
import type { ReportImage } from "../../../../../src/server/report/core/image/report-image-shelf.ts"
import { reportImagePath } from "../../../../../src/shared/report/report-image.ts"

// 内容はすべて架空（実物の会話を使わない）。
const fictionalImage: ReportImage = {
  mediaType: "image/png",
  content: new Uint8Array([1, 2, 3]),
}

function build(overrides: {
  bodyHtml?: string
  css?: string
  masthead?: Partial<Parameters<typeof buildReportExportDocument>[0]["masthead"]>
}) {
  return buildReportExportDocument({
    bodyHtml: overrides.bodyHtml ?? "<p>架空の本文</p>",
    css: overrides.css ?? "",
    masthead: { kind: "最終レポート", title: "架空の題", ...overrides.masthead },
    findImage: (toolUseId, path) =>
      toolUseId === "toolu_1" && path === "shots/a.png" ? fictionalImage : undefined,
  })
}

describe("buildReportExportDocument", () => {
  it("棚の画像を data: に替え、棚に無い画像は1行の知らせに替える", () => {
    const html = build({
      bodyHtml: `<img alt="a" src="${reportImagePath("toolu_1", "shots/a.png")}?t=tok"><img src="${reportImagePath("toolu_1", "none.png")}">`,
    })
    expect(html).toContain('src="data:image/png;base64,AQID"')
    expect(html).toContain("画像を読めなかった: none.png")
    expect(html).not.toContain("/report-image/")
  })

  it("外部の読み込みを持たず、明暗と印刷の規則を持つ", () => {
    const html = build({})
    expect(html).not.toMatch(/<link\b|@import|<script\b|\ssrc="https?:/)
    expect(html).toContain("prefers-color-scheme: dark")
    expect(html).toContain("@media print")
  })

  it("表紙の帯は無い項目を出さず、字を逃がす", () => {
    const html = build({
      masthead: { title: "<b>題</b>", taskId: "PROJ-1", at: "2026-01-02 03:04" },
    })
    expect(html).toContain("&lt;b&gt;題&lt;/b&gt;")
    expect(html).toContain("PROJ-1")
    expect(html).toContain("<dt>日時</dt>")
    expect(html).not.toContain("<dt>依頼</dt>")
    expect(html).not.toContain('class="outcome"')
  })

  it("画面から集めた :root の色が、明るい環境の色を上書きしない", () => {
    const collected = ":root { --ink: #e8e3ea; --ink-bright: #f7f6f8 }"
    const html = build({ css: collected })
    const collectedAt = html.indexOf(collected)
    const wrapAt = html.indexOf("@media not (prefers-color-scheme: dark)")
    expect(collectedAt).toBeGreaterThan(-1)
    expect(wrapAt).toBeGreaterThan(collectedAt)
    const wrap = html.slice(wrapAt)
    expect(wrap).toMatch(/--ink: #2a2530;/)
    expect(wrap).toMatch(/--ink-bright: #17131c;/)
  })

  it("集めた CSS が style を閉じられない", () => {
    expect(build({ css: "a{}</style><p>x" })).not.toContain("</style><p>x")
  })
})

describe("reportExportFileName", () => {
  const now = Temporal.PlainDateTime.from("2026-11-18T09:05")

  it("タスク ID があればそれを、無ければ題を短くして使う", () => {
    expect(
      reportExportFileName({
        taskId: "PROJ-7",
        sessionTitle: "題",
        now,
        existingNames: new Set(),
      }),
    ).toBe("tsukumo-report-PROJ-7-20261118-0905.html")
    const name = reportExportFileName({
      sessionTitle: `a/b:c 架空の とても長い題名${"あ".repeat(40)}`,
      now,
      existingNames: new Set(),
    })
    expect(name).toMatch(/^tsukumo-report-abc-架空の-[^/:]{0,20}-20261118-0905\.html$/)
    expect(name.length).toBeLessThan(80)
  })

  it("同じ名前があれば -2 から足す", () => {
    const first = "tsukumo-report-PROJ-1-20261118-0905.html"
    const second = "tsukumo-report-PROJ-1-20261118-0905-2.html"
    const input = { taskId: "PROJ-1", sessionTitle: "", now }
    expect(reportExportFileName({ ...input, existingNames: new Set([first]) })).toBe(second)
    expect(reportExportFileName({ ...input, existingNames: new Set([first, second]) })).toBe(
      "tsukumo-report-PROJ-1-20261118-0905-3.html",
    )
  })
})
