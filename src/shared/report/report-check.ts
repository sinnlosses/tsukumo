// `report` の検証結果の欄 `checks` の形と、表の HTML の組み立て。形の出どころはここだけ。

import { z } from "zod"

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlAttribute, htmlInline } from "./report-inline-markdown.ts"

/** 検証1項目の状態。確かめなかった・飛ばしたものは `unverified` にまとめ、理由は `detail` に書かせる。 */
const REPORT_CHECK_STATUSES = ["ok", "ng", "unverified"] as const

export type ReportCheckStatus = (typeof REPORT_CHECK_STATUSES)[number]

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
      "ng なら落ちた理由、unverified なら確かめなかった理由を1文で。ok の行には描かないので書かない。直した経緯や打ち直した回数は書かない。無ければ空文字",
    ),
  howToVerify: z
    .string()
    .describe(
      "unverified のとき必須。知らない人が繰り返せる確かめ方を1〜2文で（何を開いて・何をして・何が見えれば良いか）。ok・ng は空文字",
    ),
})

export type ReportCheck = z.infer<typeof reportCheckSchema>

/**
 * `figure`・`command`・`howToVerify` を足す前の記録（transcript からの復元）も読めるように、3つは欠けていたら空文字に畳む。
 * 状態・ラベル・補足が崩れた呼び出しは handler に届く前に SDK が差し戻すので、ここで欠けるのは古い記録だけ。
 */
const storedReportCheckSchema = reportCheckSchema.extend({
  figure: z.string().catch(""),
  command: z.string().catch(""),
  howToVerify: z.string().catch(""),
})

/** `report` の引数の `checks` を取り出す。「無い」と形の崩れは空の配列に畳む。 */
export function parseReportChecks(value: unknown): readonly ReportCheck[] {
  const parsed = z.array(storedReportCheckSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** お願いがあるときの、総括行の印が飛ぶ先（お願いの塊の `id`）。 */
export type ReportFavorTarget =
  | { readonly kind: "none" }
  | { readonly kind: "favor"; readonly id: string }

/**
 * 検証結果（1つの HTML の塊）。空なら空文字。
 * 上から、総括行（通った件数と figure・確かめていない件数・落ちた件数・お願いの印）、
 * 問題の項目（ng → unverified の順。unverified は2行目に確かめ方）、通った項目を畳んだ `<details>` の順。
 * 総括行は無い部分を出さず、お願いの印は `favor` が `favor` のときだけ置く。
 * `commandDuration` は `command` から tsukumo が測った所要時間を引く口で、`command` が空の項目には呼ばない。
 * モデルの文字列は HTML として逃がし、改行は空白に畳む（HTML の塊が空行で切れないように）。
 */
export function reportChecksMarkdown(
  rawChecks: readonly ReportCheck[],
  commandDuration: (command: string) => MeasuredTime,
  favor: ReportFavorTarget,
): string {
  if (rawChecks.length === 0) {
    return ""
  }
  const checks = rawChecks.map(withoutBackticks)
  const passed = checks.filter((check) => check.status === "ok")
  const problems = [
    ...checks.filter(isReportCheckProblem).filter((check) => check.status === "ng"),
    ...checks.filter(isReportCheckProblem).filter((check) => check.status === "unverified"),
  ]
  return (
    `<div class="checks">` +
    checksSummaryMarkdown(checks, favor) +
    (problems.length === 0
      ? ""
      : `<div role="table" aria-label="検証結果の問題">${problems
          .map((check) => checkProblemMarkdown(check, commandDuration))
          .join("")}</div>`) +
    (passed.length === 0 ? "" : passedFoldMarkdown(passed, commandDuration)) +
    `</div>`
  )
}

/** `label`・`figure`・`detail`・`howToVerify` の素の文字に記法は使えないので、バッククォートを落とす（`command` は打った文字列のまま）。 */
function withoutBackticks(check: ReportCheck): ReportCheck {
  return {
    ...check,
    label: check.label.replaceAll("`", ""),
    figure: check.figure.replaceAll("`", ""),
    detail: check.detail.replaceAll("`", ""),
    howToVerify: check.howToVerify.replaceAll("`", ""),
  }
}

/** 検証1項目のうち、問題として並べるもの（ng / unverified）。 */
type ReportCheckProblem = ReportCheck & { readonly status: Exclude<ReportCheckStatus, "ok"> }

function isReportCheckProblem(check: ReportCheck): check is ReportCheckProblem {
  return check.status !== "ok"
}

/**
 * 総括行。「✓ 検証 n件 通った <figure · figure>」「？ k件 確かめていない」「✕ m件 落ちた」「● お願い 1 ↓」のうち、あるものだけを並べる。
 * 通った項目が無いときは頭に「検証」の語だけを置く。色を付けるのは記号と状態の語（`checks-summary-mark`・`checks-summary-word`）だけ。
 */
function checksSummaryMarkdown(checks: readonly ReportCheck[], favor: ReportFavorTarget): string {
  const countOf = (status: ReportCheckStatus): string =>
    String(checks.filter((check) => check.status === status).length)
  const passed = checks.filter((check) => check.status === "ok")
  const figures = passed
    .map((check) => check.figure.trim())
    .filter((figure) => figure !== "")
    .map(htmlInline)
    .join(" · ")
  const head =
    passed.length === 0
      ? `<span class="checks-summary-lead">検証</span>`
      : `<span class="checks-summary-part checks-summary-ok">` +
        `<span class="checks-summary-mark">✓</span>検証 ${countOf("ok")}件 ` +
        `<span class="checks-summary-word">通った</span></span>` +
        (figures === "" ? "" : `<span class="checks-summary-figures">${figures}</span>`)
  const problemParts = REPORT_CHECK_PROBLEM_STATUSES.filter((status) =>
    checks.some((check) => check.status === status),
  ).map(
    (status) =>
      `<span class="checks-summary-part checks-summary-${status}">` +
      `<span class="checks-summary-mark">${REPORT_CHECK_PROBLEM_MARKS[status]}</span>${countOf(status)}件 ` +
      `<span class="checks-summary-word">${REPORT_CHECK_PROBLEM_WORDS[status]}</span></span>`,
  )
  const favorLink =
    favor.kind === "none"
      ? ""
      : `<span class="checks-summary-favor"><a href="#${htmlAttribute(favor.id)}">` +
        `<span class="checks-summary-favor-mark">●</span>お願い 1 ↓</a></span>`
  return `<div class="checks-summary">${[head, ...problemParts].join("")}${favorLink}</div>`
}

/** 問題の1項目。状態の印・label・figure・所要時間の行と、detail の段、unverified なら確かめ方の段。 */
function checkProblemMarkdown(
  check: ReportCheckProblem,
  commandDuration: (command: string) => MeasuredTime,
): string {
  const { figure, time } = figureAndTimeOf(check, commandDuration)
  const detail =
    check.detail.trim() === ""
      ? ""
      : `<div class="checks-problem-detail">${htmlInline(check.detail)}</div>`
  const howToVerify =
    check.status !== "unverified" || check.howToVerify.trim() === ""
      ? ""
      : `<div class="checks-problem-how"><span class="checks-problem-how-label">確かめ方:</span> ${htmlInline(check.howToVerify)}</div>`
  return (
    `<div class="checks-problem checks-problem-${check.status}" role="row">` +
    `<span class="checks-problem-mark">${REPORT_CHECK_PROBLEM_MARKS[check.status]} ` +
    `<span class="checks-problem-word">${REPORT_CHECK_PROBLEM_WORDS[check.status]}</span></span>` +
    `<div class="checks-problem-body"><div class="checks-problem-head">` +
    `<span class="checks-problem-label">${htmlInline(check.label)}</span>` +
    `<span class="checks-problem-figure">${figure}</span>` +
    `<span class="checks-problem-time">${time}</span>` +
    `</div>${detail}${howToVerify}</div></div>`
  )
}

/**
 * 通った項目を畳んだ `<details>`。`<summary>` は「✓ 通った n件」と label の頭（最初の全角の括弧「（」より前。無ければ全文）を ` · ` で連ねたもの。
 * 開くと figure・所要時間つきの一覧。
 */
function passedFoldMarkdown(
  passed: readonly ReportCheck[],
  commandDuration: (command: string) => MeasuredTime,
): string {
  const heads = passed
    .map((check) => {
      const headIndex = check.label.indexOf("（")
      return htmlInline(headIndex === -1 ? check.label : check.label.slice(0, headIndex))
    })
    .join(" · ")
  const rows = passed.map((check) => checkRowMarkdown(check, commandDuration)).join("")
  return (
    `<div class="checks-passed"><details><summary>` +
    `<span class="checks-passed-mark">✓ 通った ${String(passed.length)}件</span>` +
    `<span class="checks-passed-labels">${heads}</span></summary>` +
    `<div role="table" aria-label="検証結果">${rows}</div></details></div>`
  )
}

/** 通った項目の一覧の1行。記号・label・figure・所要時間を1行に並べる。 */
function checkRowMarkdown(
  check: ReportCheck,
  commandDuration: (command: string) => MeasuredTime,
): string {
  const { figure, time } = figureAndTimeOf(check, commandDuration)
  return (
    `<div class="check check-${check.status}" role="row">` +
    `<span class="check-mark">✓</span>` +
    `<span class="check-label">${htmlInline(check.label)}</span>` +
    `<span class="check-figure">${figure}</span>` +
    `<span class="check-time">${time}</span></div>`
  )
}

/** `figure` を HTML として逃がし、`command` から測った所要時間を文字にする。 */
function figureAndTimeOf(
  check: ReportCheck,
  commandDuration: (command: string) => MeasuredTime,
): { readonly figure: string; readonly time: string } {
  const duration: MeasuredTime =
    check.command.trim() === "" ? { kind: "unknown" } : commandDuration(check.command)
  return {
    figure: htmlInline(check.figure),
    time: duration.kind === "known" ? formatElapsed(Math.round(duration.milliseconds / 1000)) : "",
  }
}

/** 総括行に並べる順。 */
const REPORT_CHECK_PROBLEM_STATUSES = ["unverified", "ng"] as const satisfies readonly Exclude<
  ReportCheckStatus,
  "ok"
>[]

const REPORT_CHECK_PROBLEM_MARKS = {
  ng: "✕",
  unverified: "？",
} as const satisfies Record<Exclude<ReportCheckStatus, "ok">, string>

const REPORT_CHECK_PROBLEM_WORDS = {
  ng: "落ちた",
  unverified: "確かめていない",
} as const satisfies Record<Exclude<ReportCheckStatus, "ok">, string>
