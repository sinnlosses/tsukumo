// `report` の検証結果の欄 `checks` の形と、表の HTML の組み立て。形の出どころはここだけ。

import { z } from "zod"

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlAttribute, htmlInline } from "./report-markdown.ts"

/** 検証1項目の状態。確かめなかった・飛ばしたものは `unverified` にまとめ、理由は `detail` に書かせる。 */
export const REPORT_CHECK_STATUSES = ["ok", "ng", "unverified"] as const

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
})

export type ReportCheck = z.infer<typeof reportCheckSchema>

/**
 * `figure` と `command` を足す前の記録（transcript からの復元）も読めるように、2つは欠けていたら空文字に畳む。
 * 状態・ラベル・補足が崩れた呼び出しは handler に届く前に SDK が差し戻すので、ここで欠けるのは古い記録だけ。
 */
const storedReportCheckSchema = reportCheckSchema.extend({
  figure: z.string().catch(""),
  command: z.string().catch(""),
})

/** `report` の引数の `checks` を取り出す。「無い」と形の崩れは空の配列に畳む。 */
export function parseReportChecks(value: unknown): readonly ReportCheck[] {
  const parsed = z.array(storedReportCheckSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** 検証全体の判定。ng が1つでもあれば `ng`、無く unverified があれば `unverified`、どちらも無ければ `ok`。 */
type ReportChecksVerdict = ReportCheckStatus

/**
 * 検証結果（1つの HTML の塊）。空なら空文字。
 * 左に判定の札（記号・「ok 件数 / 全件数」・ひとこと）、右に欄を置く。
 * 全部 ok なら、右は小見出し「検証」と全行の一覧。
 * ng / unverified があれば、右は問題の項目（ng → unverified の順）を label・detail つきで並べ、
 * その下に通った項目を label の頭だけの小さな札で並べる。
 * `commandDuration` は `command` から tsukumo が測った所要時間を引く口で、`command` が空の項目には呼ばない。
 * モデルの文字列は HTML として逃がし、改行は空白に畳む（HTML の塊が空行で切れないように）。
 */
export function reportChecksMarkdown(
  checks: readonly ReportCheck[],
  commandDuration: (command: string) => MeasuredTime,
): string {
  if (checks.length === 0) {
    return ""
  }
  const okCount = checks.filter((check) => check.status === "ok").length
  const ngCount = checks.filter((check) => check.status === "ng").length
  const unverifiedCount = checks.filter((check) => check.status === "unverified").length
  const verdict: ReportChecksVerdict =
    ngCount > 0 ? "ng" : unverifiedCount > 0 ? "unverified" : "ok"

  const body =
    verdict === "ok"
      ? allOkBodyMarkdown(checks, commandDuration)
      : problemsBodyMarkdown(checks, commandDuration)

  return (
    `<div class="checks">` +
    checksTileMarkdown(verdict, okCount, checks.length, ngCount, unverifiedCount) +
    `<div class="checks-body">${body}</div></div>`
  )
}

/** 判定の札。記号・「ok 件数 / 全件数」・ひとこと（全部通った / k つ未確認 / k つ落ちた）。 */
function checksTileMarkdown(
  verdict: ReportChecksVerdict,
  okCount: number,
  total: number,
  ngCount: number,
  unverifiedCount: number,
): string {
  const hint =
    verdict === "ng"
      ? `${String(ngCount)} つ落ちた`
      : verdict === "unverified"
        ? `${String(unverifiedCount)} つ未確認`
        : "全部通った"
  return (
    `<div class="checks-tile checks-tile-${verdict}">` +
    `<span class="checks-tile-mark">${REPORT_CHECK_TILE_MARK_TEXTS[verdict]}</span>` +
    `<span class="checks-tile-count">${String(okCount)} / ${String(total)}</span>` +
    `<span class="checks-tile-hint">${hint}</span></div>`
  )
}

/** 全部 ok のときの右の欄。小見出し「検証」と全行の一覧。 */
function allOkBodyMarkdown(
  checks: readonly ReportCheck[],
  commandDuration: (command: string) => MeasuredTime,
): string {
  const rows = checks.map((check) => checkRowMarkdown(check, commandDuration)).join("")
  return (
    `<div class="checks-heading">検証</div>` +
    `<div role="table" aria-label="検証結果">${rows}</div>`
  )
}

/** 検証1項目のうち、問題として並べるもの（ng / unverified）。 */
type ReportCheckProblem = ReportCheck & { readonly status: Exclude<ReportCheckStatus, "ok"> }

function isReportCheckProblem(check: ReportCheck): check is ReportCheckProblem {
  return check.status !== "ok"
}

/** ng / unverified があるときの右の欄。問題の項目（ng → unverified の順）と、通った項目の小さな札。 */
function problemsBodyMarkdown(
  checks: readonly ReportCheck[],
  commandDuration: (command: string) => MeasuredTime,
): string {
  const problems = [
    ...checks.filter(isReportCheckProblem).filter((check) => check.status === "ng"),
    ...checks.filter(isReportCheckProblem).filter((check) => check.status === "unverified"),
  ]
  const passed = checks.filter((check) => check.status === "ok")
  const problemRows = problems.map((check) => checkProblemMarkdown(check, commandDuration)).join("")
  const passedChips =
    passed.length === 0
      ? ""
      : `<div class="checks-passed">${passed.map(checkPassedChipMarkdown).join("")}</div>`
  return `<div role="table" aria-label="検証結果の問題">${problemRows}</div>${passedChips}`
}

/** 問題の1項目。状態の印・label の行と、detail の段。figure・所要時間も label の右に添える。 */
function checkProblemMarkdown(
  check: ReportCheckProblem,
  commandDuration: (command: string) => MeasuredTime,
): string {
  const { figure, time } = figureAndTimeOf(check, commandDuration)
  const detail =
    check.detail.trim() === ""
      ? ""
      : `<p class="checks-problem-detail">${htmlInline(check.detail)}</p>`
  return (
    `<div class="checks-problem checks-problem-${check.status}" role="row">` +
    `<div class="checks-problem-head">` +
    `<span class="checks-problem-mark">${REPORT_CHECK_PROBLEM_MARK_TEXTS[check.status]}</span>` +
    `<span class="checks-problem-label">${htmlInline(check.label)}</span>` +
    `<span class="checks-problem-figure">${figure}</span>` +
    `<span class="checks-problem-time">${time}</span>` +
    `</div>${detail}</div>`
  )
}

/** 通った1項目の小さな札。文字は label の頭（最初の全角の括弧「（」より前。無ければ全文）、`title` に全文。 */
function checkPassedChipMarkdown(check: ReportCheck): string {
  const headIndex = check.label.indexOf("（")
  const head = headIndex === -1 ? check.label : check.label.slice(0, headIndex)
  return (
    `<span class="checks-passed-chip" title="${htmlAttribute(check.label)}">` +
    `<span class="checks-passed-chip-mark">✓</span>${htmlInline(head)}</span>`
  )
}

/** 全部 ok のときの一覧の1行。記号・label・figure・所要時間を1行に並べる。 */
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

/** 判定の札に出す記号（状態 → 記号だけ）。 */
const REPORT_CHECK_TILE_MARK_TEXTS = {
  ok: "✓",
  ng: "✕",
  unverified: "？",
} as const satisfies Record<ReportChecksVerdict, string>

/** 問題の行に出す「記号＋状態語」。 */
const REPORT_CHECK_PROBLEM_MARK_TEXTS = {
  ng: "✕ 落ちた",
  unverified: "？ 未確認",
} as const satisfies Record<Exclude<ReportCheckStatus, "ok">, string>
