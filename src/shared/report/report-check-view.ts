// `report` の検証結果を、描く順に並べ終えた値にする。HTML の文字列と面の部品の両方がこの値から描く。

import { formatElapsed, type MeasuredTime } from "../utils/elapsed-time.ts"

/**
 * 検証1項目の状態。`unobserved` は確かめなかった・飛ばしたもの、`blocked` は前提が止まっていて確かめられなかったもので、
 * どちらも `ok` と描かず、理由は `detail` に書かせる。
 */
export const REPORT_CHECK_STATUSES = ["ok", "ng", "unobserved", "blocked"] as const

export type ReportCheckStatus = (typeof REPORT_CHECK_STATUSES)[number]

export type ReportCheckProblemStatus = Exclude<ReportCheckStatus, "ok">

/** 値にする前の検証1項目（`report` の引数の `checks` の1つ）。 */
export type ReportCheckInput = {
  readonly status: ReportCheckStatus
  readonly label: string
  readonly figure: string
  readonly command: string
  readonly detail: string
  readonly howToVerify: string
}

/** お願いがあるときの、総括行の印が飛ぶ先（お願いの塊の `id`）。 */
export type ReportFavorTarget =
  | { readonly kind: "none" }
  | { readonly kind: "favor"; readonly id: string }

/**
 * 問題の1項目。字はバッククォートを落としただけの逃がす前の字。
 * `time` は `command` から測った所要時間の字で、測れなければ空文字。
 * `detail` は空白だけなら空文字、`howToVerify` は `unobserved` で空白だけでないときだけ残す。
 */
export type ReportCheckProblemRow = {
  readonly status: ReportCheckProblemStatus
  readonly label: string
  readonly figure: string
  readonly time: string
  readonly detail: string
  readonly howToVerify: string
}

/** 通った1項目。`labelHead` は label の最初の全角の括弧「（」より前（無ければ全文）。 */
export type ReportCheckPassedRow = {
  readonly label: string
  readonly labelHead: string
  readonly figure: string
  readonly time: string
}

/**
 * 検証結果の値。項目が無ければ `none`。
 * 総括行の `figures` は通った項目の空でない figure（前後の空白を落とす）、`problems` は総括行に並べる順の状態ごとの件数で、件数 0 の状態は持たない。
 * `problems` の行は ng → blocked → unobserved の順、`passed` の行は入力の順。
 */
export type ReportChecksView =
  | { readonly kind: "none" }
  | {
      readonly kind: "checks"
      readonly summary: {
        readonly passedCount: number
        readonly figures: readonly string[]
        readonly problems: readonly {
          readonly status: ReportCheckProblemStatus
          readonly count: number
        }[]
        readonly favor: ReportFavorTarget
      }
      readonly problems: readonly ReportCheckProblemRow[]
      readonly passed: readonly ReportCheckPassedRow[]
    }

/** 総括行に並べる順。 */
const REPORT_CHECK_SUMMARY_ORDER = [
  "unobserved",
  "blocked",
  "ng",
] as const satisfies readonly ReportCheckProblemStatus[]

export const REPORT_CHECK_PROBLEM_MARKS = {
  ng: "✕",
  blocked: "⊘",
  unobserved: "？",
} as const satisfies Record<ReportCheckProblemStatus, string>

export const REPORT_CHECK_PROBLEM_WORDS = {
  ng: "落ちた",
  blocked: "止まっている",
  unobserved: "確かめていない",
} as const satisfies Record<ReportCheckProblemStatus, string>

/**
 * 検証結果を値にする。`commandDuration` は `command` から tsukumo が測った所要時間を引く口で、`command` が空白だけの項目には呼ばない。
 */
export function reportChecksView(
  rawChecks: readonly ReportCheckInput[],
  commandDuration: (command: string) => MeasuredTime,
  favor: ReportFavorTarget,
): ReportChecksView {
  if (rawChecks.length === 0) {
    return { kind: "none" }
  }
  const checks = rawChecks.map(withoutBackticks)
  const passed = checks.filter((check) => check.status === "ok")
  const problemChecks = checks.flatMap((check) =>
    check.status === "ok" ? [] : [{ ...check, status: check.status }],
  )
  const timeOf = (check: ReportCheckInput): string => {
    const duration: MeasuredTime =
      check.command.trim() === "" ? { kind: "unknown" } : commandDuration(check.command)
    return duration.kind === "known" ? formatElapsed(Math.round(duration.milliseconds / 1000)) : ""
  }
  return {
    kind: "checks",
    summary: {
      passedCount: passed.length,
      figures: passed.map((check) => check.figure.trim()).filter((figure) => figure !== ""),
      problems: REPORT_CHECK_SUMMARY_ORDER.flatMap((status) => {
        const count = problemChecks.filter((check) => check.status === status).length
        return count === 0 ? [] : [{ status, count }]
      }),
      favor,
    },
    problems: REPORT_CHECK_ROW_ORDER.flatMap((status) =>
      problemChecks
        .filter((check) => check.status === status)
        .map((check) => ({
          status: check.status,
          label: check.label,
          figure: check.figure,
          time: timeOf(check),
          detail: check.detail.trim() === "" ? "" : check.detail,
          howToVerify:
            check.status !== "unobserved" || check.howToVerify.trim() === ""
              ? ""
              : check.howToVerify,
        })),
    ),
    passed: passed.map((check) => {
      const headIndex = check.label.indexOf("（")
      return {
        label: check.label,
        labelHead: headIndex === -1 ? check.label : check.label.slice(0, headIndex),
        figure: check.figure,
        time: timeOf(check),
      }
    }),
  }
}

/** `label`・`figure`・`detail`・`howToVerify` の素の文字に記法は使えないので、バッククォートを落とす（`command` は打った文字列のまま）。 */
function withoutBackticks(check: ReportCheckInput): ReportCheckInput {
  return {
    ...check,
    label: check.label.replaceAll("`", ""),
    figure: check.figure.replaceAll("`", ""),
    detail: check.detail.replaceAll("`", ""),
    howToVerify: check.howToVerify.replaceAll("`", ""),
  }
}

const REPORT_CHECK_ROW_ORDER = [
  "ng",
  "blocked",
  "unobserved",
] as const satisfies readonly ReportCheckProblemStatus[]
