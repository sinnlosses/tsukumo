import { describe, expect, it } from "vitest"

import {
  parseReportChecks,
  type ReportCheck,
  reportChecksMarkdown,
  type ReportFavorTarget,
} from "../../../src/shared/report/report-check.ts"
import type { MeasuredTime } from "../../../src/shared/utils/elapsed-time.ts"

const UNMEASURED = (): MeasuredTime => ({ kind: "unknown" })

const NO_FAVOR: ReportFavorTarget = { kind: "none" }

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

/** 総括行の HTML（`checks-summary` の div の中身まで）。 */
const summaryOf = (markdown: string): string =>
  markdown.slice(
    markdown.indexOf('<div class="checks-summary">'),
    markdown.indexOf("</div>", markdown.indexOf('<div class="checks-summary">')),
  )

describe("reportChecksMarkdown", () => {
  it("総括行 → ng の行 → unverified の行 → 通った行の <details> の順に組む", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ok", "架空の一"),
        check("unverified", "架空の二", { detail: "架空の理由", howToVerify: "架空の確かめ方" }),
        check("ng", "架空の三", { detail: "架空の落ちた理由" }),
        check("ok", "架空の四"),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    const order = [
      markdown.indexOf('<div class="checks-summary">'),
      markdown.indexOf('<div class="checks-problem checks-problem-ng"'),
      markdown.indexOf('<div class="checks-problem checks-problem-unverified"'),
      markdown.indexOf('<div class="checks-passed"><details>'),
    ]
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual(order.toSorted((a, b) => a - b))
    expect(markdown.startsWith('<div class="checks">')).toBe(true)
    expect(markdown).toContain('role="table" aria-label="検証結果の問題"')
    const [open = "", folded = ""] = markdown.split('<div class="checks-passed"><details>')
    expect(open).not.toContain("架空の一")
    expect(folded.indexOf("架空の一")).toBeLessThan(folded.indexOf("架空の四"))
  })

  it("総括行は通った件数と figure・確かめていない件数・落ちた件数を、この順に並べる", () => {
    const summary = summaryOf(
      reportChecksMarkdown(
        [
          check("ng", "架空の落ちた項目"),
          check("ok", "架空の一", { figure: "単体 12" }),
          check("unverified", "架空の目視", { howToVerify: "架空の確かめ方" }),
          check("ok", "架空の二"),
          check("ok", "架空の三", { figure: "E2E 3" }),
        ],
        UNMEASURED,
        NO_FAVOR,
      ),
    )

    expect(summary).toContain(
      '<span class="checks-summary-part checks-summary-ok"><span class="checks-summary-mark">✓</span>検証 3件 ' +
        '<span class="checks-summary-word">通った</span></span>' +
        '<span class="checks-summary-figures">単体 12 · E2E 3</span>' +
        '<span class="checks-summary-part checks-summary-unverified"><span class="checks-summary-mark">？</span>1件 ' +
        '<span class="checks-summary-word">確かめていない</span></span>' +
        '<span class="checks-summary-part checks-summary-ng"><span class="checks-summary-mark">✕</span>1件 ' +
        '<span class="checks-summary-word">落ちた</span></span>',
    )
  })

  it("総括行は無い部分を出さない。通った項目が無ければ頭は「検証」の語だけ", () => {
    const allOk = summaryOf(reportChecksMarkdown([check("ok", "架空の一")], UNMEASURED, NO_FAVOR))
    expect(allOk).not.toContain("checks-summary-unverified")
    expect(allOk).not.toContain("checks-summary-ng")
    expect(allOk).not.toContain("checks-summary-figures")

    const onlyNg = reportChecksMarkdown([check("ng", "架空の一")], UNMEASURED, NO_FAVOR)
    expect(summaryOf(onlyNg)).toContain('<span class="checks-summary-lead">検証</span>')
    expect(summaryOf(onlyNg)).not.toContain("checks-summary-ok")
    expect(onlyNg).not.toContain("<details")
  })

  it("お願いがあるときだけ、総括行の右端にお願いの塊へ飛ぶ印を置く", () => {
    const checks = [check("ok", "架空の一")]
    const withFavor = reportChecksMarkdown(checks, UNMEASURED, {
      kind: "favor",
      id: "favor-toolu_r1",
    })

    expect(summaryOf(withFavor)).toMatch(
      /<span class="checks-summary-favor"><a href="#favor-toolu_r1">.*お願い 1 ↓<\/a><\/span>$/u,
    )
    expect(reportChecksMarkdown(checks, UNMEASURED, NO_FAVOR)).not.toContain("<a ")
  })

  it("全部 ok なら総括行と、通った行を畳んだ <details> だけを置く", () => {
    const markdown = reportChecksMarkdown(
      [check("ok", "架空の一"), check("ok", "架空の二"), check("ok", "架空の三")],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).not.toContain("checks-problem")
    expect(markdown).toContain(
      '<div class="checks-passed"><details><summary><span class="checks-passed-mark">✓ 通った 3件</span>' +
        '<span class="checks-passed-labels">架空の一 · 架空の二 · 架空の三</span></summary>' +
        '<div role="table" aria-label="検証結果">',
    )
    expect(markdown.match(/<div class="check check-ok" role="row">/gu)).toHaveLength(3)
  })

  it("畳んだ行の summary は label の頭（最初の全角の括弧の前。無ければ全文）を連ねる", () => {
    const markdown = reportChecksMarkdown(
      [check("ok", "疑似セッションの迎える画面（1024×768）で見る"), check("ok", "括弧の無い項目")],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toContain(
      '<span class="checks-passed-labels">疑似セッションの迎える画面 · 括弧の無い項目</span>',
    )
    expect(markdown).toContain(
      '<span class="check-label">疑似セッションの迎える画面（1024×768）で見る</span>',
    )
  })

  it("問題の行は記号と状態の語・label・figure・所要時間と detail、unverified には確かめ方を描く（ok の detail は描かない）", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ok", "架空の一", { detail: "架空の経緯" }),
        check("ng", "架空の二", {
          figure: "56 件中 1 件",
          command: "架空の検査",
          detail: "架空の落ちた理由",
        }),
        check("unverified", "架空の三", {
          detail: "架空の理由",
          howToVerify: "架空の窓を開いて見る",
        }),
      ],
      () => ({ kind: "known", milliseconds: 62_000 }),
      NO_FAVOR,
    )

    expect(markdown).not.toContain("架空の経緯")
    expect(markdown).toContain(
      '<div class="checks-problem checks-problem-ng" role="row">' +
        '<span class="checks-problem-mark">✕ <span class="checks-problem-word">落ちた</span></span>' +
        '<div class="checks-problem-body"><div class="checks-problem-head">' +
        '<span class="checks-problem-label">架空の二</span>' +
        '<span class="checks-problem-figure">56 件中 1 件</span>' +
        '<span class="checks-problem-time">1分02秒</span></div>' +
        '<div class="checks-problem-detail">架空の落ちた理由</div></div></div>',
    )
    expect(markdown).toContain(
      '<div class="checks-problem-detail">架空の理由</div>' +
        '<div class="checks-problem-how"><span class="checks-problem-how-label">確かめ方:</span> 架空の窓を開いて見る</div>',
    )
  })

  it("確かめ方が空の unverified と、ng の確かめ方は描かない", () => {
    const markdown = reportChecksMarkdown(
      [check("unverified", "架空の一"), check("ng", "架空の二", { howToVerify: "架空の書き過ぎ" })],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).not.toContain("checks-problem-how")
  })

  it("通った行の一覧は状態・label・figure・所要時間の4列で、figure と時間が空でも列は残る", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ok", "架空の一", { figure: "56 件中 1 件", command: "架空の検査" }),
        check("ok", "架空の二"),
      ],
      () => ({ kind: "known", milliseconds: 62_000 }),
      NO_FAVOR,
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
        check("ok", "架空の一", { command: "架空の検査" }),
        check("ok", "架空の二", { command: "架空の別" }),
        check("ok", "架空の三"),
      ],
      (command) => {
        asked.push(command)
        return command === "架空の検査"
          ? { kind: "known", milliseconds: 58_600 }
          : { kind: "unknown" }
      },
      NO_FAVOR,
    )

    expect(asked).toEqual(["架空の検査", "架空の別"])
    expect(markdown.match(/check-time">59秒/gu)).toHaveLength(1)
  })

  it("モデルの文字列は HTML として逃がし、改行は空白に畳む（塊が1行のまま）", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ng", "<b>架空</b> & 検査", { figure: "<i>1</i>", detail: "架空の\n\n件数" }),
        check("unverified", "架空の目視", { howToVerify: "<a>窓</a>\n\nを開く" }),
        check("ok", "架空の一", { figure: "<i>2</i>" }),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toContain('<span class="checks-problem-figure">&lt;i&gt;1&lt;/i&gt;</span>')
    expect(markdown).toContain(
      '<span class="checks-problem-label">&lt;b&gt;架空&lt;/b&gt; &amp; 検査</span>',
    )
    expect(markdown).toContain('<div class="checks-problem-detail">架空の 件数</div>')
    expect(markdown).toContain("&lt;a&gt;窓&lt;/a&gt; を開く</div>")
    expect(markdown).toContain('<span class="checks-summary-figures">&lt;i&gt;2&lt;/i&gt;</span>')
    expect(markdown).not.toContain("\n")
  })

  it("label・figure・detail・howToVerify のバッククォートは外し、command には手を付けない", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ng", "`pnpm run check` を打った", {
          figure: "`2` 件",
          command: "echo `date`",
          detail: "`a.ts` が落ちた",
        }),
        check("unverified", "架空の目視", { howToVerify: "`b.ts` を開く" }),
        check("ok", "`架空` の確認"),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).not.toContain("`")
    expect(markdown).toContain("pnpm run check を打った")
    expect(markdown).toContain("a.ts が落ちた")
    expect(markdown).toContain("b.ts を開く")
    expect(markdown).toContain("架空 の確認")
  })

  it("空なら何も描かない", () => {
    expect(reportChecksMarkdown([], UNMEASURED, { kind: "favor", id: "favor-toolu_r1" })).toBe("")
  })
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

  it("howToVerify があれば残す", () => {
    const stored = check("unverified", "架空", {
      detail: "架空の理由",
      howToVerify: "架空の窓を開いて見る",
    })

    expect(parseReportChecks([stored])).toEqual([stored])
  })
})
