import { describe, expect, it } from "vitest"

import { parseReportChecks, reportChecksMarkdown } from "../../../src/shared/report/report-check.ts"
import type { MeasuredTime } from "../../../src/shared/utils/elapsed-time.ts"

const UNMEASURED = (): MeasuredTime => ({ kind: "unknown" })

describe("reportChecksMarkdown", () => {
  it("3つの状態を、カードの色の印と文字の両方で描く", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "ng", label: "架空の二", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の三", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain(
      '<div class="check check-ok"><div class="check-head"><span class="check-mark">✓ OK</span>',
    )
    expect(markdown).toContain(
      '<div class="check check-ng"><div class="check-head"><span class="check-mark">✕ NG</span>',
    )
    expect(markdown).toContain(
      '<div class="check check-unverified"><div class="check-head"><span class="check-mark">? 未確認</span>',
    )
  })

  it("figure は空でなければ大きな数として描き、空なら描かない", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "12 / 3", command: "", detail: "" },
        { status: "ok", label: "架空の二", figure: " ", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown.match(/check-figure/gu)).toHaveLength(1)
    expect(markdown).toContain('<span class="check-figure">12 / 3</span>')
  })

  it("command の所要時間が測れていれば添え、測れていなければ添えない。空の command は引きに行かない", () => {
    const asked: string[] = []
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "架空の検査", detail: "" },
        { status: "ok", label: "架空の二", figure: "", command: "架空の別", detail: "" },
        { status: "ok", label: "架空の三", figure: "", command: "", detail: "" },
      ],
      (command) => {
        asked.push(command)
        return command === "架空の検査"
          ? { kind: "known", milliseconds: 58_600 }
          : { kind: "unknown" }
      },
    )

    expect(asked).toEqual(["架空の検査", "架空の別"])
    expect(markdown.match(/check-time/gu)).toHaveLength(1)
    expect(markdown).toContain('<span class="check-time">59秒</span>')
  })

  it("モデルの文字列は HTML として逃がし、改行は空白に畳む（カードの並びが1行の塊のまま）", () => {
    const markdown = reportChecksMarkdown(
      [
        {
          status: "ok",
          label: "<b>架空</b> & 検査",
          figure: "<i>1</i>",
          command: "",
          detail: "架空の\n\n件数",
        },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain('<span class="check-figure">&lt;i&gt;1&lt;/i&gt;</span>')
    expect(markdown).toContain("<b>&lt;b&gt;架空&lt;/b&gt; &amp; 検査</b> 架空の 件数")
    expect(markdown).not.toContain("\n")
  })

  it("空なら何も描かない", () => {
    expect(reportChecksMarkdown([], UNMEASURED)).toBe("")
  })
})

describe("parseReportChecks", () => {
  it("無いときと形の崩れたときは空の配列に畳む", () => {
    expect(parseReportChecks(undefined)).toEqual([])
    expect(parseReportChecks([{ status: "skipped", label: "架空", detail: "" }])).toEqual([])
  })

  it("figure と command の無い前の形の記録は、2つを空文字にして読む", () => {
    expect(parseReportChecks([{ status: "ok", label: "架空", detail: "架空の件数" }])).toEqual([
      { status: "ok", label: "架空", figure: "", command: "", detail: "架空の件数" },
    ])
  })
})
