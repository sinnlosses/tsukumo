// 紙の確かさの台帳。検証結果の全行と、`Claims` の確定でない主張を、落ちた・確かめていない・確かめたの3群に並べる。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportCheckSeal } from "../../../../shared/report/report-check-seal.ts"
import type { ReportChecksView } from "../../../../shared/report/report-check-view.ts"

/** 台帳の1行。主張の行は主張の1文目だけを持ち、`targetId` で節の中の主張の要素を指す。 */
export type CertaintyLedgerRow =
  | CertaintyLedgerCheckRow
  | {
      readonly kind: "claim"
      readonly text: string
      readonly command: ""
      readonly seal: { readonly kind: "claimed" }
      readonly detail: string
      readonly howToVerify: string
      readonly targetId: string
    }

type CertaintyLedgerCheckRow = {
  readonly kind: "check"
  readonly text: string
  readonly figure: string
  readonly command: string
  readonly seal: ReportCheckSeal
  readonly detail: string
  readonly howToVerify: string
}

/** 確かめた行。`head` は畳んだ1行に並べる文の頭（検証結果の `labelHead`）。 */
export type CertaintyLedgerPassedRow = CertaintyLedgerCheckRow & { readonly head: string }

export type CertaintyLedger = {
  readonly failed: readonly CertaintyLedgerRow[]
  readonly unknown: readonly CertaintyLedgerRow[]
  readonly passed: readonly CertaintyLedgerPassedRow[]
  readonly counts: {
    readonly failed: number
    readonly unknown: number
    readonly passed: number
  }
}

/**
 * 台帳を作る。`failed` は `ng` の行、`unknown` は `blocked`・`unobserved` の行（検証結果の並びのまま）に続けて確定でない主張（部品の順）、`passed` は `ok` の行。
 */
export function certaintyLedgerOf(
  checks: ReportChecksView,
  components: readonly A2uiReportComponent[],
): CertaintyLedger {
  const problems = checks.kind === "checks" ? checks.problems : []
  const problemRow = (row: (typeof problems)[number]): CertaintyLedgerRow => ({
    kind: "check",
    text: row.label,
    figure: row.figure,
    command: row.command,
    seal: row.seal,
    detail: row.detail,
    howToVerify: row.howToVerify,
  })
  const failed = problems.filter((row) => row.status === "ng").map(problemRow)
  const unknown = [
    ...problems.filter((row) => row.status !== "ng").map(problemRow),
    ...unsettledClaimRows(components),
  ]
  const passed = (checks.kind === "checks" ? checks.passed : []).map(
    (row): CertaintyLedgerPassedRow => ({
      kind: "check",
      text: row.label,
      head: row.labelHead,
      figure: row.figure,
      command: row.command,
      seal: row.seal,
      detail: "",
      howToVerify: "",
    }),
  )
  return {
    failed,
    unknown,
    passed,
    counts: { failed: failed.length, unknown: unknown.length, passed: passed.length },
  }
}

/** 節の中の主張の要素の id。台帳の主張の行の飛び先と `ClaimsLeaf` の行の id がこの1つの決め方を共有する。 */
export function claimTargetId(partId: string, index: number): string {
  return `claim-${partId}-${String(index)}`
}

function unsettledClaimRows(
  components: readonly A2uiReportComponent[],
): readonly CertaintyLedgerRow[] {
  return components.flatMap((part) =>
    part.component === "Claims"
      ? part.items.flatMap((item, index): readonly CertaintyLedgerRow[] =>
          item.certainty === "confirmed"
            ? []
            : [
                {
                  kind: "claim",
                  text: firstSentenceOf(item.claim),
                  command: "",
                  seal: { kind: "claimed" },
                  detail: item.basis,
                  howToVerify: item.howToVerify,
                  targetId: claimTargetId(part.id, index),
                },
              ],
        )
      : [],
  )
}

function firstSentenceOf(text: string): string {
  const end = text.indexOf("。")
  return end === -1 ? text : text.slice(0, end + 1)
}
