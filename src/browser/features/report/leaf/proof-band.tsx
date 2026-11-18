// 冒頭の検証のまとめ（字の1行）と、節の末尾の印と控え。状態の印は行ごと・節ごとに1個だけ持つ。

import type { ReactElement } from "react"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  REPORT_CHECK_PROBLEM_WORDS,
  type ReportChecksView,
} from "../../../../shared/report/report-check-view.ts"
import { plainInline } from "../../../../shared/report/report-inline-markdown.ts"
import { FIRST_NOTE_TEXT } from "../../../domain/first-note.ts"
import type { ReportSectionProof } from "../domain/report-proof.ts"
import styles from "./proof-band.module.css"

type Summary = Extract<ReportChecksView, { readonly kind: "checks" }>["summary"]

/**
 * 打ったコマンドの記録と照らせた行の印。照らせない行には印を付けない。
 * 説明は初回の説明を消したあとも読めるよう、印にも持たせる。
 */
export function RecordedMark(props: {
  readonly runCount: number
  readonly className?: string
}): ReactElement {
  return (
    <span
      className={props.className}
      title={FIRST_NOTE_TEXT["report-terms"]}
      aria-description={FIRST_NOTE_TEXT["report-terms"]}
    >
      {`記録あり・${String(props.runCount)}回`}
    </span>
  )
}

/**
 * 検証のまとめの1行。「確かめたこと n件」「通った a・確かめていない b」「単体 …・E2E …」を字で言う。
 * 欄の題「確かめたこと」の中に置くときは leadWord を false にして件数だけにする。
 */
export function ChecksTotalLine(props: {
  readonly summary: Summary
  readonly leadWord?: boolean
}): ReactElement {
  const { leadWord = true } = props
  const { passedCount, figures, problems } = props.summary
  const total = problems.reduce((sum, { count }) => sum + count, passedCount)
  const verdicts = [
    ...(passedCount > 0 ? [`通った ${String(passedCount)}`] : []),
    ...problems.map(
      ({ status, count }) => `${REPORT_CHECK_PROBLEM_WORDS[status]} ${String(count)}`,
    ),
  ]
  const figureText = figures.map(plainInline).join("・")
  return (
    <div className={styles.total}>
      <span className={styles["total-lead"]}>
        {`${leadWord ? "確かめたこと " : ""}${String(total)}件`}
      </span>
      {verdicts.length > 0 && <span>{verdicts.join("・")}</span>}
      {figureText !== "" && <span className={styles["total-figures"]}>{figureText}</span>}
    </div>
  )
}

/** 節の末尾の印と控え。控えは同じやり取りで打ったコマンドと照らせた行だけを並べる。 */
export function SectionProof(props: { readonly section: ReportSectionProof }): ReactElement {
  const { mark, receipts, runCount } = props.section
  return (
    <p className={styles.proof} data-proof={mark}>
      {mark === "ng" && (
        <span className={styles.seal} data-seal="state">
          {`${REPORT_CHECK_PROBLEM_MARKS.ng} ${REPORT_CHECK_PROBLEM_WORDS.ng}`}
        </span>
      )}
      {mark === "recorded" && (
        <RecordedMark runCount={runCount} className={styles["seal-outline"]} />
      )}
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
