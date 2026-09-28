// `report` の検証結果の欄 `checks` の形と、カードの並びの HTML の組み立て。形の出どころはここだけ。

import { z } from "zod"

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"
import { htmlInline } from "./report-block.ts"

/** 検証1項目の状態。確かめなかった・飛ばしたものは `unverified` にまとめ、理由は `detail` に書かせる。 */
export const REPORT_CHECK_STATUSES = ["ok", "ng", "unverified"] as const

export type ReportCheckStatus = (typeof REPORT_CHECK_STATUSES)[number]

export const reportCheckSchema = z.object({
  status: z.enum(REPORT_CHECK_STATUSES),
  label: z.string().describe("何で確かめたか（コマンド・テスト・手で見た場面）"),
  figure: z
    .string()
    .describe(
      "結果を1つの数で言う短い文字列（例: 2849 / 56、25px、0 件）。数だけを書き、「が通過」のような述語は付けない。カードの中央に大きく描く。数で言えなければ空文字",
    ),
  command: z
    .string()
    .describe(
      "確かめるのに打った Bash のコマンドを、打った文字列のまま（tsukumo が同じターンの呼び出しと完全一致で突き合わせ、測った所要時間を添える）。コマンドでない確認は空文字",
    ),
  detail: z
    .string()
    .describe(
      "ng なら落ちた理由、unverified なら確かめなかった理由を1文で。ok のカードには描かないので書かない。直した経緯や打ち直した回数は書かない。無ければ空文字",
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
 * 検証結果のカードの並び（1行の HTML）。空なら空文字。
 * 1枚は「label と状態」の段、「figure と所要時間」の段、「detail」の段の順で、中身の無い段は置かない。
 * detail は ng / unverified の理由だけで、ok のカードには描かない。
 * 状態はカードの色と文字の両方で見せる（色だけで意味を伝えない）。
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
  const cards = checks.map((check) => {
    const mark = REPORT_CHECK_MARKS[check.status]
    const duration: MeasuredTime =
      check.command.trim() === "" ? { kind: "unknown" } : commandDuration(check.command)
    const numbers = [
      ...(check.figure.trim() === ""
        ? []
        : [`<span class="check-figure">${htmlInline(check.figure)}</span>`]),
      ...(duration.kind === "known"
        ? [
            `<span class="check-time">${formatElapsed(Math.round(duration.milliseconds / 1000))}</span>`,
          ]
        : []),
    ]
    const rows = [
      `<div class="check-head"><span class="check-label">${htmlInline(check.label)}</span><span class="check-mark">${mark.text}</span></div>`,
      ...(numbers.length === 0 ? [] : [`<div class="check-numbers">${numbers.join("")}</div>`]),
      ...(check.status === "ok" || check.detail.trim() === ""
        ? []
        : [`<div class="check-body">${htmlInline(check.detail)}</div>`]),
    ]
    return `<div class="check ${mark.card}">${rows.join("")}</div>`
  })
  return `<div class="checks">${cards.join("")}</div>`
}

/** 状態 → カードの色の印と、色と一緒に出す文字。 */
const REPORT_CHECK_MARKS = {
  ok: { card: "check-ok", text: "✓ OK" },
  ng: { card: "check-ng", text: "✕ NG" },
  unverified: { card: "check-unverified", text: "? 未確認" },
} as const satisfies Record<ReportCheckStatus, { readonly card: string; readonly text: string }>
