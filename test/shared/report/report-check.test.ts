import { describe, expect, it } from "vitest"

import { parseReportChecks, reportChecksMarkdown } from "../../../src/shared/report/report-check.ts"
import type { MeasuredTime } from "../../../src/shared/utils/elapsed-time.ts"

const UNMEASURED = (): MeasuredTime => ({ kind: "unknown" })

describe("reportChecksMarkdown", () => {
  it("すべて通ったら、総括と figure を summary にした details に全行を畳む", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "単体 12", command: "", detail: "" },
        { status: "ok", label: "架空の二", figure: "", command: "", detail: "" },
        { status: "ok", label: "架空の三", figure: "E2E 3", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown.startsWith('<div class="checks"><details><summary>')).toBe(true)
    expect(markdown).toContain(
      '<summary><span class="checks-summary">検証 <span class="checks-summary-count">3</span> <span class="checks-summary-ok">✓ すべて通った</span> <span class="checks-summary-figures">単体 12 · E2E 3</span></span></summary>',
    )
    expect(markdown).toContain('</summary><div role="table" aria-label="検証結果">')
    expect(markdown.match(/<div class="check check-ok" role="row">/gu)).toHaveLength(3)
    expect(markdown).not.toContain("checks-rest")
  })

  it("落ちた・確かめていない行は ng → unverified の順に開き、通った行は「ほか n 件」に畳む", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の二", figure: "", command: "", detail: "" },
        { status: "ng", label: "架空の三", figure: "", command: "", detail: "" },
        { status: "ok", label: "架空の四", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )
    const [open = "", rest = ""] = markdown.split('<div class="checks-rest">')

    expect(open.indexOf("架空の三")).toBeLessThan(open.indexOf("架空の二"))
    expect(open).not.toContain("架空の一")
    expect(open).not.toContain("<details>")
    expect(rest).toContain(
      '<summary><span class="checks-summary-ok">✓</span> ほか 2 件はすべて通った</summary>',
    )
    expect(rest).toContain('<div role="table" aria-label="通った検証">')
    expect(rest.indexOf("架空の一")).toBeLessThan(rest.indexOf("架空の四"))
  })

  it("通った行が無ければ「ほか n 件」の畳みを置かない", () => {
    const markdown = reportChecksMarkdown(
      [{ status: "ng", label: "架空の一", figure: "", command: "", detail: "" }],
      UNMEASURED,
    )

    expect(markdown).not.toContain("checks-rest")
    expect(markdown).not.toContain("<details>")
  })

  it("全体の状態は ng があれば赤、無く unverified があれば黄、どちらも無ければ緑", () => {
    const ngMarkdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "ng", label: "架空の二", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の三", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )
    expect(ngMarkdown).toContain('<span class="checks-summary-ng">✕ 1 件が落ちた</span>')

    const unverifiedMarkdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の三", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )
    expect(unverifiedMarkdown).toContain(
      '<span class="checks-summary-warn">？ 1 件を確かめていない</span>',
    )
  })

  it("行は状態・label・figure・所要時間の4列で、状態はどれも文字で描く（未確認は全角の？）", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "ng", label: "架空の二", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の三", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain(
      '<div class="check check-ok" role="row"><span class="check-mark">✓ OK</span><span class="check-label">架空の一</span><span class="check-figure"></span><span class="check-time"></span></div>',
    )
    expect(markdown).toContain(
      '<div class="check check-ng" role="row"><span class="check-mark">✕ NG</span><span class="check-label">架空の二</span><span class="check-figure"></span><span class="check-time"></span></div>',
    )
    expect(markdown).toContain(
      '<div class="check check-unverified" role="row"><span class="check-mark">？ 未確認</span><span class="check-label">架空の三</span><span class="check-figure"></span><span class="check-time"></span></div>',
    )
  })

  it("detail は ng と未確認の行にだけ2段目として描き、ok の行には描かない", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "架空の経緯" },
        { status: "ng", label: "架空の二", figure: "", command: "", detail: "架空の落ちた理由" },
        { status: "unverified", label: "架空の三", figure: "", command: "", detail: "架空の理由" },
      ],
      UNMEASURED,
    )

    expect(markdown).not.toContain("架空の経緯")
    expect(markdown).toContain('<span class="check-body">架空の落ちた理由</span>')
    expect(markdown).toContain('<span class="check-body">架空の理由</span>')
  })

  it("figure と時間はどちらも空なら列だけ残る（列の位置をそろえるため常に描く）", () => {
    const markdown = reportChecksMarkdown(
      [
        {
          status: "ok",
          label: "架空の一",
          figure: "56 件中 1 件",
          command: "架空の検査",
          detail: "",
        },
        { status: "ok", label: "架空の二", figure: "", command: "", detail: "" },
      ],
      () => ({ kind: "known", milliseconds: 62_000 }),
    )

    expect(markdown).toContain(
      '<span class="check-figure">56 件中 1 件</span><span class="check-time">1分02秒</span>',
    )
    expect(markdown).toContain('<span class="check-figure"></span><span class="check-time"></span>')
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
    expect(markdown.match(/check-time">59秒/gu)).toHaveLength(1)
  })

  it("モデルの文字列は HTML として逃がし、改行は空白に畳む（表の並びが1行の塊のまま）", () => {
    const markdown = reportChecksMarkdown(
      [
        {
          status: "ng",
          label: "<b>架空</b> & 検査",
          figure: "<i>1</i>",
          command: "",
          detail: "架空の\n\n件数",
        },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain('<span class="check-figure">&lt;i&gt;1&lt;/i&gt;</span>')
    expect(markdown).toContain(
      '<span class="check-label">&lt;b&gt;架空&lt;/b&gt; &amp; 検査</span>',
    )
    expect(markdown).toContain('<span class="check-body">架空の 件数</span>')
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
