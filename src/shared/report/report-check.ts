// `report` の検証結果の欄 `checks` の形と、表の HTML の組み立て。形の出どころはここだけ。

import { z } from "zod"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  REPORT_CHECK_PROBLEM_WORDS,
  REPORT_CHECK_STATUSES,
  type ReportCheckPassedRow,
  type ReportCheckProblemRow,
  type ReportChecksView,
} from "./report-check-view.ts"
import { htmlAttribute, htmlInline } from "./report-inline-markdown.ts"

export const reportCheckSchema = z.object({
  status: z.enum(REPORT_CHECK_STATUSES),
  label: z.string().describe("何で確かめたか（コマンド・テスト・手で見た場面）"),
  figure: z
    .string()
    .describe(
      "結果を1つの数で言う短い文字列（例: 単体 2855・E2E 57、56 件中 1 件、ずれ 2px）。" +
        "数だけを書き、「が通過」のような述語は付けない。「2849 / 56」のような割り算や分数に見える" +
        "書き方はしない。行の右に描く。数で言えなければ空文字",
    ),
  command: z
    .string()
    .describe(
      "確かめるのに打った Bash のコマンドを、打った文字列のまま（tsukumo が同じターンの呼び出しと完全一致で突き合わせ、測った所要時間を添える）。コマンドでない確認は空文字",
    ),
  detail: z
    .string()
    .describe(
      "ng・unobserved は理由、blocked は止めている前提を1文で。ok の行には描かないので書かない。直した経緯や打ち直した回数は書かない。無ければ空文字",
    ),
  howToVerify: z
    .string()
    .describe(
      "unobserved のとき必須。知らない人が繰り返せる確かめ方を1〜2文で（何を開いて・何をして・何が見えれば良いか）。ok・ng・blocked は空文字",
    ),
})

export type ReportCheck = z.infer<typeof reportCheckSchema>

/**
 * `figure`・`command`・`howToVerify` を足す前の記録（transcript からの復元）も読めるように、3つは欠けていたら空文字に畳む。
 * 状態・ラベル・補足が崩れた呼び出しは handler に届く前に SDK が差し戻すので、ここで欠けるのは古い記録だけ。
 */
const storedReportCheckSchema = z.preprocess(
  readLegacyStatus,
  reportCheckSchema.extend({
    figure: z.string().catch(""),
    command: z.string().catch(""),
    howToVerify: z.string().catch(""),
  }),
)

/** `report` の引数の `checks` を取り出す。「無い」と形の崩れは空の配列に畳む。 */
export function parseReportChecks(value: unknown): readonly ReportCheck[] {
  const parsed = z.array(storedReportCheckSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/**
 * 検証結果の値（`reportChecksView` が作る）を1つの HTML の塊にする。`none` なら空文字。
 * 上から、総括行、問題の項目（unobserved は2行目に確かめ方）、通った項目を畳んだ `<details>` の順。
 * 総括行は無い部分を出さず、お願いの印は `favor` が `favor` のときだけ置く。
 * モデルの文字列は HTML として逃がし、改行は空白に畳む（HTML の塊が空行で切れないように）。
 */
export function reportChecksViewMarkdown(view: ReportChecksView): string {
  if (view.kind === "none") {
    return ""
  }
  return (
    `<div class="checks">` +
    checksSummaryMarkdown(view.summary) +
    (view.problems.length === 0
      ? ""
      : `<div role="table" aria-label="検証結果の問題">${view.problems
          .map(checkProblemMarkdown)
          .join("")}</div>`) +
    (view.passed.length === 0 ? "" : passedFoldMarkdown(view.passed)) +
    `</div>`
  )
}

/** 状態が `unobserved` になる前の記録の `unverified` は、同じ意味の `unobserved` として読む。 */
function readLegacyStatus(value: unknown): unknown {
  return typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "unverified"
    ? { ...value, status: "unobserved" }
    : value
}

/**
 * 総括行。「✓ 検証 n件 通った <figure · figure>」「？ k件 確かめていない」「⊘ j件 止まっている」「✕ m件 落ちた」「● お願い 1 ↓」のうち、あるものだけを並べる。
 * 通った項目が無いときは頭に「検証」の語だけを置く。色を付けるのは記号と状態の語（`checks-summary-mark`・`checks-summary-word`）だけ。
 */
function checksSummaryMarkdown(
  summary: Extract<ReportChecksView, { readonly kind: "checks" }>["summary"],
): string {
  const figures = summary.figures.map(htmlInline).join(" · ")
  const head =
    summary.passedCount === 0
      ? `<span class="checks-summary-lead">検証</span>`
      : `<span class="checks-summary-part checks-summary-ok">` +
        `<span class="checks-summary-mark">✓</span>検証 ${String(summary.passedCount)}件 ` +
        `<span class="checks-summary-word">通った</span></span>` +
        (figures === "" ? "" : `<span class="checks-summary-figures">${figures}</span>`)
  const problemParts = summary.problems.map(
    ({ status, count }) =>
      `<span class="checks-summary-part checks-summary-${status}">` +
      `<span class="checks-summary-mark">${REPORT_CHECK_PROBLEM_MARKS[status]}</span>${String(count)}件 ` +
      `<span class="checks-summary-word">${REPORT_CHECK_PROBLEM_WORDS[status]}</span></span>`,
  )
  const favorLink =
    summary.favor.kind === "none"
      ? ""
      : `<span class="checks-summary-favor"><a href="#${htmlAttribute(summary.favor.id)}">` +
        `<span class="checks-summary-favor-mark">●</span>お願い 1 ↓</a></span>`
  return `<div class="checks-summary">${[head, ...problemParts].join("")}${favorLink}</div>`
}

/** 問題の1項目。状態の印・label・figure・所要時間の行と、detail の段、確かめ方の段。 */
function checkProblemMarkdown(row: ReportCheckProblemRow): string {
  const detail =
    row.detail === "" ? "" : `<div class="checks-problem-detail">${htmlInline(row.detail)}</div>`
  const howToVerify =
    row.howToVerify === ""
      ? ""
      : `<div class="checks-problem-how"><span class="checks-problem-how-label">確かめ方:</span> ${htmlInline(row.howToVerify)}</div>`
  return (
    `<div class="checks-problem checks-problem-${row.status}" role="row">` +
    `<span class="checks-problem-mark">${REPORT_CHECK_PROBLEM_MARKS[row.status]} ` +
    `<span class="checks-problem-word">${REPORT_CHECK_PROBLEM_WORDS[row.status]}</span></span>` +
    `<div class="checks-problem-body"><div class="checks-problem-head">` +
    `<span class="checks-problem-label">${htmlInline(row.label)}</span>` +
    `<span class="checks-problem-figure">${htmlInline(row.figure)}</span>` +
    `<span class="checks-problem-time">${row.time}</span>` +
    `</div>${detail}${howToVerify}</div></div>`
  )
}

/**
 * 通った項目を畳んだ `<details>`。`<summary>` は「✓ 通った n件」と label の頭を ` · ` で連ねたもの。
 * 開くと figure・所要時間つきの一覧。
 */
function passedFoldMarkdown(passed: readonly ReportCheckPassedRow[]): string {
  const heads = passed.map((row) => htmlInline(row.labelHead)).join(" · ")
  const rows = passed.map(checkRowMarkdown).join("")
  return (
    `<div class="checks-passed"><details><summary>` +
    `<span class="checks-passed-mark">✓ 通った ${String(passed.length)}件</span>` +
    `<span class="checks-passed-labels">${heads}</span></summary>` +
    `<div role="table" aria-label="検証結果">${rows}</div></details></div>`
  )
}

/** 通った項目の一覧の1行。記号・label・figure・所要時間を1行に並べる。 */
function checkRowMarkdown(row: ReportCheckPassedRow): string {
  return (
    `<div class="check check-ok" role="row">` +
    `<span class="check-mark">✓</span>` +
    `<span class="check-label">${htmlInline(row.label)}</span>` +
    `<span class="check-figure">${htmlInline(row.figure)}</span>` +
    `<span class="check-time">${row.time}</span></div>`
  )
}
