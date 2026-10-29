// 面の頭の合図の行（検証結果）を、値から直接描く。
// 要素・属性・class・text ノードの割れ方は、同じ値を HTML の塊にした `reportChecksViewMarkdown` を Markdown で描いたものと同じにする。

import clsx from "clsx"
import type { ReactElement } from "react"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  REPORT_CHECK_PROBLEM_WORDS,
  type ReportCheckPassedRow,
  type ReportCheckProblemRow,
  type ReportChecksView,
} from "../../../../../../shared/report/report-check-view.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import { checksClassName } from "../markdown/markdown.tsx"

type Checks = Extract<ReportChecksView, { readonly kind: "checks" }>

export function ChecksVerdict(props: { readonly view: Checks }): ReactElement {
  const { summary, problems, passed } = props.view
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

/** 総括行。お願いの印は押すと `location.hash` を書かずに飛び先の要素へ転がす（`location.hash` は見ているターンの経路）。 */
function ChecksSummary(props: { readonly summary: Checks["summary"] }): ReactElement {
  const { passedCount, figures, problems, favor } = props.summary
  const figureText = figures.map(plainInline).join(" · ")
  return (
    <div className={checksClassName("checks-summary")}>
      {passedCount === 0 && <span className={checksClassName("checks-summary-lead")}>検証</span>}
      {passedCount > 0 && (
        <span
          className={clsx(
            checksClassName("checks-summary-part"),
            checksClassName("checks-summary-ok"),
          )}
        >
          <span className={checksClassName("checks-summary-mark")}>✓</span>
          {`検証 ${String(passedCount)}件 `}
          <span className={checksClassName("checks-summary-word")}>通った</span>
        </span>
      )}
      {passedCount > 0 && figureText !== "" && (
        <span className={checksClassName("checks-summary-figures")}>{figureText}</span>
      )}
      {problems.map(({ status, count }) => (
        <span
          key={status}
          className={clsx(
            checksClassName("checks-summary-part"),
            checksClassName(`checks-summary-${status}`),
          )}
        >
          <span className={checksClassName("checks-summary-mark")}>
            {REPORT_CHECK_PROBLEM_MARKS[status]}
          </span>
          {`${String(count)}件 `}
          <span className={checksClassName("checks-summary-word")}>
            {REPORT_CHECK_PROBLEM_WORDS[status]}
          </span>
        </span>
      ))}
      {favor.kind === "favor" && (
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
      )}
    </div>
  )
}

function ProblemRow(props: { readonly row: ReportCheckProblemRow }): ReactElement {
  const { row } = props
  return (
    <div
      className={clsx(
        checksClassName("checks-problem"),
        checksClassName(`checks-problem-${row.status}`),
      )}
      role="row"
    >
      <span className={checksClassName("checks-problem-mark")}>
        {`${REPORT_CHECK_PROBLEM_MARKS[row.status]} `}
        <span className={checksClassName("checks-problem-word")}>
          {REPORT_CHECK_PROBLEM_WORDS[row.status]}
        </span>
      </span>
      <div className={checksClassName("checks-problem-body")}>
        <div className={checksClassName("checks-problem-head")}>
          <span className={checksClassName("checks-problem-label")}>{plainInline(row.label)}</span>
          <span className={checksClassName("checks-problem-figure")}>
            {plainInline(row.figure)}
          </span>
          <span className={checksClassName("checks-problem-time")}>{row.time}</span>
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
  return (
    <div className={checksClassName("checks-passed")}>
      <details>
        <summary>
          <span className={checksClassName("checks-passed-mark")}>
            {`✓ 通った ${String(passed.length)}件`}
          </span>
          <span className={checksClassName("checks-passed-labels")}>
            {passed.map((row) => plainInline(row.labelHead)).join(" · ")}
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
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
