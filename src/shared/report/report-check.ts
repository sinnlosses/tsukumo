// `report` の検証結果の欄 `checks` の形と、表の HTML の組み立て。形の出どころはここだけ。

import { z } from "zod"

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlInline } from "./report-markdown.ts"

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

/**
 * 検証結果の表（1つの HTML の塊）。空なら空文字。
 * 上に「検証 N」＋全体の状態（すべて通った・k 件が落ちた・k 件を確かめていない）の1行、
 * 下に1項目1行の並びを描く。行は「状態・label・figure・所要時間」の4列で、
 * detail は ng / unverified の行だけ2段目に描く。
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
  const rows = checks.map((check) => checkRowMarkdown(check, commandDuration)).join("")
  return `<div class="checks" role="table" aria-label="検証結果">${summaryMarkdown(checks)}${rows}</div>`
}

/** 検証の総数と、全体の状態を伝える1行。ng があれば赤、無く unverified があれば黄、どちらも無ければ緑。 */
function summaryMarkdown(checks: readonly ReportCheck[]): string {
  const ngCount = checks.filter((check) => check.status === "ng").length
  const unverifiedCount = checks.filter((check) => check.status === "unverified").length
  const verdict =
    ngCount > 0
      ? `<span class="checks-summary-ng">✕ ${String(ngCount)} 件が落ちた</span>`
      : unverifiedCount > 0
        ? `<span class="checks-summary-warn">？ ${String(unverifiedCount)} 件を確かめていない</span>`
        : `<span class="checks-summary-ok">✓ すべて通った</span>`
  return `<div class="checks-summary">検証 <span class="checks-summary-count">${String(checks.length)}</span> ${verdict}</div>`
}

/** 検証1項目の行。状態・label・figure・所要時間を1行の4列に並べ、detail は ng / unverified だけ2段目に足す。 */
function checkRowMarkdown(
  check: ReportCheck,
  commandDuration: (command: string) => MeasuredTime,
): string {
  const duration: MeasuredTime =
    check.command.trim() === "" ? { kind: "unknown" } : commandDuration(check.command)
  const time =
    duration.kind === "known" ? formatElapsed(Math.round(duration.milliseconds / 1000)) : ""
  const detail =
    check.status === "ok" || check.detail.trim() === ""
      ? ""
      : `<span class="check-body">${htmlInline(check.detail)}</span>`
  return (
    `<div class="check check-${check.status}" role="row">` +
    `<span class="check-mark">${REPORT_CHECK_MARK_TEXTS[check.status]}</span>` +
    `<span class="check-label">${htmlInline(check.label)}</span>` +
    `<span class="check-figure">${htmlInline(check.figure)}</span>` +
    `<span class="check-time">${time}</span>` +
    `${detail}</div>`
  )
}

/** 状態 → 状態の列に出す文字（未確認だけ全角の「？」）。 */
const REPORT_CHECK_MARK_TEXTS = {
  ok: "✓ OK",
  ng: "✕ NG",
  unverified: "？ 未確認",
} as const satisfies Record<ReportCheckStatus, string>
