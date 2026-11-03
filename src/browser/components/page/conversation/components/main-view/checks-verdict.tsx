// 面の頭の合図の行（検証結果）を、値から直接描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  REPORT_CHECK_PROBLEM_WORDS,
  type ReportCheckPassedRow,
  type ReportCheckProblemRow,
  type ReportFavorTarget,
  type ReportChecksView,
} from "../../../../../../shared/report/report-check-view.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import { Badge } from "../../../../ui/badge/badge.tsx"
import { checksClassName } from "../markdown/markdown.tsx"
import styles from "./main-view.module.css"

type Checks = Extract<ReportChecksView, { readonly kind: "checks" }>

const PROBLEM_TONE = {
  ng: "ng",
  unobserved: "warn",
  blocked: "neutral",
} as const satisfies Record<keyof typeof REPORT_CHECK_PROBLEM_WORDS, "ng" | "warn" | "neutral">

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

/** お願いの印。押すと `location.hash` を書かずに飛び先の要素へ転がす（`location.hash` は見ているターンの経路）。お願いが無ければ何も描かない。 */
export function FavorJump(props: { readonly favor: ReportFavorTarget }): ReactElement {
  const { favor } = props
  if (favor.kind === "none") {
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
  const { passedCount, figures, problems, favor } = props.summary
  const figureText = figures.map(plainInline).join(" · ")
  return (
    <div className={checksClassName("checks-summary")}>
      {passedCount === 0 && <span className={checksClassName("checks-summary-lead")}>検証</span>}
      {passedCount > 0 && (
        <Badge tone="ok" shape="square" className={styles["verdict-badge"]}>
          {`✓ ${String(passedCount)}件 通った`}
        </Badge>
      )}
      {problems.map(({ status, count }) => (
        <Badge
          key={status}
          tone={PROBLEM_TONE[status]}
          shape="square"
          className={styles["verdict-badge"]}
        >
          {`${REPORT_CHECK_PROBLEM_MARKS[status]} ${String(count)}件 ${REPORT_CHECK_PROBLEM_WORDS[status]}`}
        </Badge>
      ))}
      {passedCount > 0 && figureText !== "" && (
        <span className={checksClassName("checks-summary-figures")}>{figureText}</span>
      )}
      <FavorJump favor={favor} />
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
            <Badge tone="ok" shape="square" className={styles["verdict-badge"]}>
              {`✓ 通った ${String(passed.length)}件`}
            </Badge>
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
