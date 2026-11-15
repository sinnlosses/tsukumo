// 冒頭の裏づけの帯。目盛りは主張（節）ごとに1つとやっていないことの1件ごとに1つで、形・記号・語で言い分ける。

import type { ReactElement } from "react"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  REPORT_CHECK_PROBLEM_WORDS,
} from "../../../../shared/report/report-check-view.ts"
import { plainInline } from "../../../../shared/report/report-inline-markdown.ts"
import type {
  ReportProofCount,
  ReportProofView,
  ReportSectionProof,
} from "../domain/report-proof.ts"
import styles from "./proof-band.module.css"

type Band = Extract<ReportProofView, { readonly kind: "band" }>

const MARK_WORDS = {
  ng: `${REPORT_CHECK_PROBLEM_MARKS.ng} ${REPORT_CHECK_PROBLEM_WORDS.ng}`,
  declared: "？ 申告のみ",
  recorded: "✓ 記録あり",
  "not-done": "－ やっていない",
} as const satisfies Record<ReportProofCount["kind"], string>

const NAME_WORDS = {
  ng: "落ちた",
  declared: "申告のみ",
  recorded: "記録あり",
  "not-done": "やっていない",
} as const satisfies Record<ReportProofCount["kind"], string>

export function ProofBand(props: { readonly band: Band }): ReactElement {
  const { band } = props
  return (
    <div className={styles.band}>
      <span className={styles.ticks} role="img" aria-label={proofBandName(band)}>
        {band.ticks.map((tick, index) => (
          <span
            key={`${String(index)}:${tick.kind === "section" ? tick.sectionId : tick.text}`}
            className={styles.tick}
            data-proof={tick.kind === "section" ? tick.mark : "not-done"}
          />
        ))}
      </span>
      <ul className={styles.counts} aria-hidden="true">
        <li className={styles.claims}>{`主張 ${String(band.claimCount)}件`}</li>
        {band.counts.map(({ kind, count }) => (
          <li key={kind}>{`${MARK_WORDS[kind]} ${String(count)}`}</li>
        ))}
      </ul>
    </div>
  )
}

/** 節の末尾の印と控え。控えは同じやり取りで打ったコマンドと照らせた行だけを並べる。 */
export function SectionProof(props: { readonly section: ReportSectionProof }): ReactElement {
  const { mark, receipts } = props.section
  return (
    <p className={styles.proof} data-proof={mark}>
      <span className={styles.seal}>{MARK_WORDS[mark]}</span>
      {receipts.map((row, index) => (
        <span key={`${String(index)}:${row.label}`} className={styles.receipt}>
          {[plainInline(row.label), plainInline(row.figure), row.time]
            .filter((part) => part !== "")
            .join(" ")}
        </span>
      ))}
    </p>
  )
}

function proofBandName(band: Band): string {
  const parts = band.counts.map(({ kind, count }) => `${NAME_WORDS[kind]} ${String(count)}`)
  return `主張 ${String(band.claimCount)}件: ${parts.join("・")}`
}
