import { describe, expect, it } from "vitest"

import { parseReportChecks, reportChecksMarkdown } from "../../../src/shared/report/report-check.ts"
import type { MeasuredTime } from "../../../src/shared/utils/elapsed-time.ts"

const UNMEASURED = (): MeasuredTime => ({ kind: "unknown" })

describe("reportChecksMarkdown", () => {
  it("すべて通ったら、左に緑の判定の札、右に小見出しと全行の一覧を置く（畳まない）", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "単体 12", command: "", detail: "" },
        { status: "ok", label: "架空の二", figure: "", command: "", detail: "" },
        { status: "ok", label: "架空の三", figure: "E2E 3", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain(
      '<div class="checks-tile checks-tile-ok"><span class="checks-tile-mark">✓</span>' +
        '<span class="checks-tile-count">3 / 3</span></div>',
    )
    expect(markdown).toContain('<div class="checks-heading">検証</div>')
    expect(markdown).toContain('<div role="table" aria-label="検証結果">')
    expect(markdown.match(/<div class="check check-ok" role="row">/gu)).toHaveLength(3)
    expect(markdown).not.toContain("checks-problem")
    expect(markdown).not.toContain("<details>")
  })

  it("ng を含めば赤の判定の札と、問題の項目（ng → unverified の順）＋通った項目の札を置く", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の二", figure: "", command: "", detail: "架空の理由" },
        { status: "ng", label: "架空の三", figure: "", command: "", detail: "架空の落ちた理由" },
        { status: "ok", label: "架空の四", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain(
      '<div class="checks-tile checks-tile-ng"><span class="checks-tile-mark">✕</span>' +
        '<span class="checks-tile-count">2 / 4</span>' +
        '<span class="checks-tile-hint">1 つ落ちた</span></div>',
    )
    const [open = "", rest = ""] = markdown.split('<div class="checks-passed">')
    expect(open.indexOf("架空の三")).toBeLessThan(open.indexOf("架空の二"))
    expect(open).not.toContain("架空の一")
    expect(open).toContain('role="table" aria-label="検証結果の問題"')
    expect(rest.indexOf("架空の一")).toBeLessThan(rest.indexOf("架空の四"))
    expect(markdown).toContain('<p class="checks-problem-detail">架空の落ちた理由</p>')
    expect(markdown).toContain('<p class="checks-problem-detail">架空の理由</p>')
  })

  it("ng が無く unverified だけなら黄の判定の札にする", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "" },
        { status: "unverified", label: "架空の三", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain(
      '<div class="checks-tile checks-tile-unverified"><span class="checks-tile-mark">？</span>' +
        '<span class="checks-tile-count">1 / 2</span>' +
        '<span class="checks-tile-hint">1 つ未確認</span></div>',
    )
  })

  it("通った行が無ければ通った項目の札を置かない", () => {
    const markdown = reportChecksMarkdown(
      [{ status: "ng", label: "架空の一", figure: "", command: "", detail: "" }],
      UNMEASURED,
    )

    expect(markdown).not.toContain("checks-passed")
  })

  it("通った項目の札は label の頭（最初の全角の括弧の前。無ければ全文）を文字にし、title に全文を入れる", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ng", label: "架空の落ちた項目", figure: "", command: "", detail: "" },
        {
          status: "ok",
          label: "疑似セッションの迎える画面（1024×768）で見る",
          figure: "",
          command: "",
          detail: "",
        },
        { status: "ok", label: "括弧の無い通った項目", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).toContain(
      '<span class="checks-passed-chip" title="疑似セッションの迎える画面（1024×768）で見る">' +
        '<span class="checks-passed-chip-mark">✓</span>疑似セッションの迎える画面</span>',
    )
    expect(markdown).toContain(
      '<span class="checks-passed-chip" title="括弧の無い通った項目">' +
        '<span class="checks-passed-chip-mark">✓</span>括弧の無い通った項目</span>',
    )
  })

  it("問題の行は状態の印・label・figure・所要時間を頭の行に並べ、detail を2段目に描く（ok には描かない）", () => {
    const markdown = reportChecksMarkdown(
      [
        { status: "ok", label: "架空の一", figure: "", command: "", detail: "架空の経緯" },
        {
          status: "ng",
          label: "架空の二",
          figure: "56 件中 1 件",
          command: "架空の検査",
          detail: "架空の落ちた理由",
        },
      ],
      () => ({ kind: "known", milliseconds: 62_000 }),
    )

    expect(markdown).not.toContain("架空の経緯")
    expect(markdown).toContain(
      '<div class="checks-problem checks-problem-ng" role="row"><div class="checks-problem-head">' +
        '<span class="checks-problem-mark">✕ 落ちた</span>' +
        '<span class="checks-problem-label">架空の二</span>' +
        '<span class="checks-problem-figure">56 件中 1 件</span>' +
        '<span class="checks-problem-time">1分02秒</span></div>' +
        '<p class="checks-problem-detail">架空の落ちた理由</p></div>',
    )
  })

  it("全部 ok の行は状態・label・figure・所要時間の4列で、figure と時間が空でも列は残る", () => {
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

    expect(markdown).toContain('<span class="checks-problem-figure">&lt;i&gt;1&lt;/i&gt;</span>')
    expect(markdown).toContain(
      '<span class="checks-problem-label">&lt;b&gt;架空&lt;/b&gt; &amp; 検査</span>',
    )
    expect(markdown).toContain('<p class="checks-problem-detail">架空の 件数</p>')
    expect(markdown).not.toContain("\n")
  })

  it("label・figure・detail のバッククォートは外し、command には手を付けない", () => {
    const markdown = reportChecksMarkdown(
      [
        {
          status: "ng",
          label: "`pnpm run check` を打った",
          figure: "`2` 件",
          command: "echo `date`",
          detail: "`a.ts` が落ちた",
        },
        { status: "ok", label: "`架空` の確認", figure: "", command: "", detail: "" },
      ],
      UNMEASURED,
    )

    expect(markdown).not.toContain("`")
    expect(markdown).toContain("pnpm run check を打った")
    expect(markdown).toContain("a.ts が落ちた")
    expect(markdown).toContain('title="架空 の確認"')
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
