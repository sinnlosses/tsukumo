// 面の頭の合図の行（検証結果）を、値から直接描く。

import clsx from "clsx"
import { createContext, type ReactElement, use } from "react"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  REPORT_CHECK_PROBLEM_WORDS,
  type ReportCheckPassedRow,
  type ReportCheckProblemRow,
  type ReportFavorTarget,
  type ReportChecksView,
} from "../../../../shared/report/report-check-view.ts"
import { plainInline } from "../../../../shared/report/report-inline-markdown.ts"
import { Badge } from "../../../components/ui/badge/badge.tsx"
import type { ReportProofView } from "../domain/report-proof.ts"
import { checksClassName } from "../markdown.tsx"
import styles from "./leaf.module.css"
import { checkSourceWord, ChecksTotalLine } from "./proof-band.tsx"

type Checks = Extract<ReportChecksView, { readonly kind: "checks" }>

const PROBLEM_TONE = {
  ng: "ng",
  unobserved: "warn",
  blocked: "neutral",
} as const satisfies Record<keyof typeof REPORT_CHECK_PROBLEM_WORDS, "ng" | "warn" | "neutral">

export function ChecksVerdict(props: {
  readonly view: Checks
  readonly proof?: ReportProofView
}): ReactElement {
  const { summary, problems, passed } = props.view
  const { proof } = props
  if (proof?.kind === "band") {
    return (
      <div className={checksClassName("verdict")} role="group" aria-label="検証結果">
        <div className={checksClassName("checks")}>
          <ChecksSummary summary={summary} />
          {proof.unboundProblems.length > 0 && (
            <div role="table" aria-label="検証結果の問題">
              {proof.unboundProblems.map((row, index) => (
                <ProblemRow key={`${String(index)}:${row.label}`} row={row} />
              ))}
            </div>
          )}
          {proof.unboundPassed.length > 0 && <PassedFold passed={proof.unboundPassed} />}
        </div>
      </div>
    )
  }
  return (
    <div className={checksClassName("verdict")} role="group" aria-label="検証結果">
      <div className={checksClassName("checks")}>
        <ChecksSummary summary={summary} />
        {problems.length > 0 && (
          <div role="table" aria-label="検証結果の問題">
            {problems.map((row, index) => (
              <ProblemRow key={`${String(index)}:${row.label}`} row={row} />
            ))}
          </div>
        )}
        {passed.length > 0 && <PassedFold passed={passed} />}
      </div>
    </div>
  )
}

/** お願いの印を本文の中に出すか。置く側が決め、`"none"` は入力欄の上の帯が知らせるとき。 */
export type FavorMark = "inline" | "none"

export const FavorMarkContext = createContext<FavorMark>("inline")

/** お願いの印。押すと `location.hash` を書かずに飛び先の要素へ転がす（`location.hash` は見ているターンの経路）。お願いが無い・`FavorMark` が `"none"` なら何も描かない。 */
export function FavorJump(props: { readonly favor: ReportFavorTarget }): ReactElement {
  const { favor } = props
  const mark = use(FavorMarkContext)
  if (favor.kind === "none" || mark === "none") {
    return <></>
  }
  return (
    <span className={checksClassName("checks-summary-favor")}>
      <a
        href={`#${favor.id}`}
        onClick={(event) => {
          event.preventDefault()
          event.currentTarget.ownerDocument
            .getElementById(favor.id)
            ?.scrollIntoView({ block: "start" })
        }}
      >
        <span className={checksClassName("checks-summary-favor-mark")}>●</span>
        お願い 1 ↓
      </a>
    </span>
  )
}

/** 総括行。お願いの印は押すと `location.hash` を書かずに飛び先の要素へ転がす（`location.hash` は見ているターンの経路）。 */
function ChecksSummary(props: { readonly summary: Checks["summary"] }): ReactElement {
  return (
    <div className={checksClassName("checks-summary")}>
      <ChecksTotalLine summary={props.summary} />
      <FavorJump favor={props.summary.favor} />
    </div>
  )
}

function ProblemRow(props: { readonly row: ReportCheckProblemRow }): ReactElement {
  const { row } = props
  return (
    <div className={checksClassName("checks-problem")} role="row">
      <span className={checksClassName("checks-problem-mark")}>
        <Badge tone={PROBLEM_TONE[row.status]} shape="square" className={styles["verdict-badge"]}>
          {`${REPORT_CHECK_PROBLEM_MARKS[row.status]} ${REPORT_CHECK_PROBLEM_WORDS[row.status]}`}
        </Badge>
      </span>
      <div className={checksClassName("checks-problem-body")}>
        <div className={checksClassName("checks-problem-head")}>
          <span className={checksClassName("checks-problem-label")}>{plainInline(row.label)}</span>
          <span className={checksClassName("checks-problem-figure")}>
            {plainInline(row.figure)}
          </span>
          <span className={checksClassName("checks-problem-time")}>{row.time}</span>
          <span className={checksClassName("checks-problem-source")}>
            {checkSourceWord(row.recorded, row.runCount)}
          </span>
        </div>
        {row.detail !== "" && (
          <div className={checksClassName("checks-problem-detail")}>{plainInline(row.detail)}</div>
        )}
        {row.howToVerify !== "" && (
          <div className={checksClassName("checks-problem-how")}>
            <span className={checksClassName("checks-problem-how-label")}>確かめ方:</span>
            {` ${plainInline(row.howToVerify)}`}
          </div>
        )}
      </div>
    </div>
  )
}

/** 通った項目を畳んだ `<details>`。`<summary>` は件数と label の頭、開くと figure・所要時間つきの一覧。 */
function PassedFold(props: { readonly passed: readonly ReportCheckPassedRow[] }): ReactElement {
  const { passed } = props
  const recordedRuns = passed
    .filter((row) => row.recorded)
    .reduce((sum, row) => sum + row.runCount, 0)
  return (
    <div className={checksClassName("checks-passed")}>
      <details>
        <summary>
          <span className={checksClassName("checks-passed-mark")}>
            <Badge tone="ok" shape="square" className={styles["verdict-badge"]}>
              {`✓ 通った ${String(passed.length)}件`}
            </Badge>
          </span>
          <span className={checksClassName("checks-passed-labels")}>
            {passed.map((row) => plainInline(row.labelHead)).join(" · ")}
            {recordedRuns > 0 && (
              <>
                {"　"}
                <span className={checksClassName("checks-passed-recorded")}>
                  {checkSourceWord(true, recordedRuns)}
                </span>
              </>
            )}
          </span>
        </summary>
        <div role="table" aria-label="検証結果">
          {passed.map((row, index) => (
            <div
              key={`${String(index)}:${row.label}`}
              className={clsx(checksClassName("check"), checksClassName("check-ok"))}
              role="row"
            >
              <span className={checksClassName("check-mark")}>✓</span>
              <span className={checksClassName("check-label")}>{plainInline(row.label)}</span>
              <span className={checksClassName("check-figure")}>{plainInline(row.figure)}</span>
              <span className={checksClassName("check-time")}>{row.time}</span>
              <span className={checksClassName("check-source")}>
                {checkSourceWord(row.recorded, row.runCount)}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
