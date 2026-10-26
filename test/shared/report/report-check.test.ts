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

const summaryPart = (kind: string, mark: string, count: string, word: string): string =>
  `<span class="checks-summary-part checks-summary-${kind}"><span class="checks-summary-mark">${mark}</span>${count} <span class="checks-summary-word">${word}</span></span>`

const okPart = (count: number): string =>
  summaryPart("ok", "✓", `検証 ${String(count)}件`, "通った")
const unobservedPart = summaryPart("unobserved", "？", "1件", "確かめていない")
const ngPart = summaryPart("ng", "✕", "1件", "落ちた")
const LEAD = '<span class="checks-summary-lead">検証</span>'

const okRow = (label: string, figure = "", time = ""): string =>
  `<div class="check check-ok" role="row"><span class="check-mark">✓</span><span class="check-label">${label}</span><span class="check-figure">${figure}</span><span class="check-time">${time}</span></div>`

const passedBlock = (count: number, labels: string, rows: string): string =>
  `<div class="checks-passed"><details><summary><span class="checks-passed-mark">✓ 通った ${String(count)}件</span><span class="checks-passed-labels">${labels}</span></summary><div role="table" aria-label="検証結果">${rows}</div></details></div>`

const problemRow = (
  kind: string,
  mark: string,
  word: string,
  head: { readonly label: string; readonly figure?: string; readonly time?: string },
  extra = "",
): string =>
  `<div class="checks-problem checks-problem-${kind}" role="row"><span class="checks-problem-mark">${mark} <span class="checks-problem-word">${word}</span></span><div class="checks-problem-body"><div class="checks-problem-head"><span class="checks-problem-label">${head.label}</span><span class="checks-problem-figure">${head.figure ?? ""}</span><span class="checks-problem-time">${head.time ?? ""}</span></div>${extra}</div></div>`

const ngRow = (head: Parameters<typeof problemRow>[3], extra = ""): string =>
  problemRow("ng", "✕", "落ちた", head, extra)
const unobservedRow = (head: Parameters<typeof problemRow>[3], extra = ""): string =>
  problemRow("unobserved", "？", "確かめていない", head, extra)
const detail = (text: string): string => `<div class="checks-problem-detail">${text}</div>`
const how = (text: string): string =>
  `<div class="checks-problem-how"><span class="checks-problem-how-label">確かめ方:</span> ${text}</div>`

const checksBlock = (summary: string, problems: string, passed: string): string =>
  `<div class="checks"><div class="checks-summary">${summary}</div>${
    problems === "" ? "" : `<div role="table" aria-label="検証結果の問題">${problems}</div>`
  }${passed}</div>`

describe("reportChecksMarkdown", () => {
  it("総括行 → ng の行 → unobserved の行 → 通った行の <details> の順に組む", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ok", "架空の一"),
        check("unobserved", "架空の二", { detail: "架空の理由", howToVerify: "架空の確かめ方" }),
        check("ng", "架空の三", { detail: "架空の落ちた理由" }),
        check("ok", "架空の四"),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        okPart(2) + unobservedPart + ngPart,
        ngRow({ label: "架空の三" }, detail("架空の落ちた理由")) +
          unobservedRow({ label: "架空の二" }, detail("架空の理由") + how("架空の確かめ方")),
        passedBlock(2, "架空の一 · 架空の四", okRow("架空の一") + okRow("架空の四")),
      ),
    )
  })

  it("総括行は通った件数と figure・確かめていない件数・落ちた件数を、この順に並べる", () => {
    const summary = summaryOf(
      reportChecksMarkdown(
        [
          check("ng", "架空の落ちた項目"),
          check("ok", "架空の一", { figure: "単体 12" }),
          check("unobserved", "架空の目視", { howToVerify: "架空の確かめ方" }),
          check("ok", "架空の二"),
          check("ok", "架空の三", { figure: "E2E 3" }),
        ],
        UNMEASURED,
        NO_FAVOR,
      ),
    )

    expect(summary).toBe(
      `<div class="checks-summary">${okPart(3)}<span class="checks-summary-figures">単体 12 · E2E 3</span>${unobservedPart}${ngPart}`,
    )
  })

  it("総括行は無い部分を出さない。通った項目が無ければ頭は「検証」の語だけ", () => {
    expect(reportChecksMarkdown([check("ok", "架空の一")], UNMEASURED, NO_FAVOR)).toBe(
      checksBlock(okPart(1), "", passedBlock(1, "架空の一", okRow("架空の一"))),
    )
    expect(reportChecksMarkdown([check("ng", "架空の一")], UNMEASURED, NO_FAVOR)).toBe(
      checksBlock(LEAD + ngPart, ngRow({ label: "架空の一" }), ""),
    )
  })

  it("お願いがあるときだけ、総括行の右端にお願いの塊へ飛ぶ印を置く", () => {
    const checks = [check("ok", "架空の一")]
    const withFavor = reportChecksMarkdown(checks, UNMEASURED, {
      kind: "favor",
      id: "favor-toolu_r1",
    })

    const passed = passedBlock(1, "架空の一", okRow("架空の一"))
    expect(withFavor).toBe(
      checksBlock(
        okPart(1) +
          '<span class="checks-summary-favor"><a href="#favor-toolu_r1"><span class="checks-summary-favor-mark">●</span>お願い 1 ↓</a></span>',
        "",
        passed,
      ),
    )
    expect(reportChecksMarkdown(checks, UNMEASURED, NO_FAVOR)).toBe(
      checksBlock(okPart(1), "", passed),
    )
  })

  it("全部 ok なら総括行と、通った行を畳んだ <details> だけを置く", () => {
    const markdown = reportChecksMarkdown(
      [check("ok", "架空の一"), check("ok", "架空の二"), check("ok", "架空の三")],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        okPart(3),
        "",
        passedBlock(
          3,
          "架空の一 · 架空の二 · 架空の三",
          okRow("架空の一") + okRow("架空の二") + okRow("架空の三"),
        ),
      ),
    )
  })

  it("畳んだ行の summary は label の頭（最初の全角の括弧の前。無ければ全文）を連ねる", () => {
    const markdown = reportChecksMarkdown(
      [check("ok", "疑似セッションの迎える画面（1024×768）で見る"), check("ok", "括弧の無い項目")],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        okPart(2),
        "",
        passedBlock(
          2,
          "疑似セッションの迎える画面 · 括弧の無い項目",
          okRow("疑似セッションの迎える画面（1024×768）で見る") + okRow("括弧の無い項目"),
        ),
      ),
    )
  })

  it("問題の行は記号と状態の語・label・figure・所要時間と detail、unobserved には確かめ方を描く（ok の detail は描かない）", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ok", "架空の一", { detail: "架空の経緯" }),
        check("ng", "架空の二", {
          figure: "56 件中 1 件",
          command: "架空の検査",
          detail: "架空の落ちた理由",
        }),
        check("unobserved", "架空の三", {
          detail: "架空の理由",
          howToVerify: "架空の窓を開いて見る",
        }),
      ],
      () => ({ kind: "known", milliseconds: 62_000 }),
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        okPart(1) + unobservedPart + ngPart,
        ngRow(
          { label: "架空の二", figure: "56 件中 1 件", time: "1分02秒" },
          detail("架空の落ちた理由"),
        ) +
          unobservedRow(
            { label: "架空の三", time: "" },
            detail("架空の理由") + how("架空の窓を開いて見る"),
          ),
        passedBlock(1, "架空の一", okRow("架空の一")),
      ),
    )
  })

  it("blocked の行は ng と別の class・記号・語で描き、総括行にも別の部分を立てる", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ng", "架空の落ちた項目"),
        check("blocked", "架空の止まった項目", { detail: "架空の止めている前提" }),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        LEAD + summaryPart("blocked", "⊘", "1件", "止まっている") + ngPart,
        ngRow({ label: "架空の落ちた項目" }) +
          problemRow(
            "blocked",
            "⊘",
            "止まっている",
            { label: "架空の止まった項目" },
            detail("架空の止めている前提"),
          ),
        "",
      ),
    )
  })

  it("確かめ方が空の unobserved と、ng の確かめ方は描かない", () => {
    const markdown = reportChecksMarkdown(
      [check("unobserved", "架空の一"), check("ng", "架空の二", { howToVerify: "架空の書き過ぎ" })],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        LEAD + unobservedPart + ngPart,
        ngRow({ label: "架空の二" }) + unobservedRow({ label: "架空の一" }),
        "",
      ),
    )
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

    expect(markdown).toBe(
      checksBlock(
        okPart(2) + '<span class="checks-summary-figures">56 件中 1 件</span>',
        "",
        passedBlock(
          2,
          "架空の一 · 架空の二",
          okRow("架空の一", "56 件中 1 件", "1分02秒") + okRow("架空の二"),
        ),
      ),
    )
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
        check("unobserved", "架空の目視", { howToVerify: "<a>窓</a>\n\nを開く" }),
        check("ok", "架空の一", { figure: "<i>2</i>" }),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        okPart(1) +
          '<span class="checks-summary-figures">&lt;i&gt;2&lt;/i&gt;</span>' +
          unobservedPart +
          ngPart,
        ngRow(
          { label: "&lt;b&gt;架空&lt;/b&gt; &amp; 検査", figure: "&lt;i&gt;1&lt;/i&gt;" },
          detail("架空の 件数"),
        ) + unobservedRow({ label: "架空の目視" }, how("&lt;a&gt;窓&lt;/a&gt; を開く")),
        passedBlock(1, "架空の一", okRow("架空の一", "&lt;i&gt;2&lt;/i&gt;")),
      ),
    )
  })

  it("label・figure・detail・howToVerify のバッククォートは外し、command には手を付けない", () => {
    const markdown = reportChecksMarkdown(
      [
        check("ng", "`pnpm run check` を打った", {
          figure: "`2` 件",
          command: "echo `date`",
          detail: "`a.ts` が落ちた",
        }),
        check("unobserved", "架空の目視", { howToVerify: "`b.ts` を開く" }),
        check("ok", "`架空` の確認"),
      ],
      UNMEASURED,
      NO_FAVOR,
    )

    expect(markdown).toBe(
      checksBlock(
        okPart(1) + unobservedPart + ngPart,
        ngRow({ label: "pnpm run check を打った", figure: "2 件" }, detail("a.ts が落ちた")) +
          unobservedRow({ label: "架空の目視" }, how("b.ts を開く")),
        passedBlock(1, "架空 の確認", okRow("架空 の確認")),
      ),
    )
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
