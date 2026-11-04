// `task` のあるレポートの結論の下に置く作業の記録（したこと・変えたファイル・確かめたこと・かかった時間）。
// 題を左・中身を右に置く行を、値のある順に並べる。値の無い行は出さず、4行とも無ければ何も描かない。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import {
  REPORT_CHECK_PROBLEM_MARKS,
  type ReportCheckPassedRow,
  type ReportCheckProblemRow,
  type ReportChecksView,
} from "../../../../../../shared/report/report-check-view.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type {
  VerificationStage,
  ReportVerification,
} from "../../../../../../shared/report/report-verification.ts"
import type { MainViewSurfaceHead } from "../../../../../../shared/session/main-view-shape.ts"
import { isBlankText } from "../../../../../../shared/utils/blank-text.ts"
import { InlineMarkdown, workRecordClassName } from "../markdown/markdown.tsx"
import { ChangedFilesFold } from "./changed-files-fold.tsx"
import { FavorJump } from "./checks-verdict.tsx"
import styles from "./main-view.module.css"
import { PhaseTimes } from "./phase-time-section.tsx"

export function WorkRecord(props: { readonly head: MainViewSurfaceHead }): ReactElement {
  const { workDone, checks, status } = props.head
  const { changedFiles, phaseTimes, verification } = status
  const rows: readonly {
    readonly key: string
    readonly title: string
    readonly body: ReactNode
  }[] = [
    ...(isBlankText(workDone)
      ? []
      : [
          {
            key: "work-done",
            title: "したこと",
            body: (
              <p className={workRecordClassName("work-record-prose")}>
                <InlineMarkdown text={workDone} />
              </p>
            ),
          },
        ]),
    ...(changedFiles.kind === "files"
      ? [
          {
            key: "changed-files",
            title: "変えたファイル",
            body: <ChangedFilesFold view={changedFiles} />,
          },
        ]
      : []),
    ...(checks.kind === "checks" || verification.kind === "checked"
      ? [
          {
            key: "checks",
            title: "確かめたこと",
            body: <CheckLines view={checks} verification={verification} />,
          },
        ]
      : []),
    ...(phaseTimes.kind === "times"
      ? [{ key: "phase-times", title: "かかった時間", body: <PhaseTimes view={phaseTimes} /> }]
      : []),
  ]
  if (rows.length === 0) {
    return <></>
  }
  return (
    <section className={workRecordClassName("work-record")} aria-label="作業の記録">
      {rows.map((row) => (
        <div key={row.key} className={workRecordClassName("work-record-row")}>
          <div className={workRecordClassName("work-record-key")}>{row.title}</div>
          <div className={workRecordClassName("work-record-value")}>{row.body}</div>
        </div>
      ))}
    </section>
  )
}

/** 控えの段名から表示名への置き換え。表に無い段名はそのまま出す。 */
const STAGE_DISPLAY_NAMES: ReadonlyMap<string, string> = new Map([
  ["typecheck", "型検査"],
  ["lint", "lint"],
  ["format:check", "整形"],
  ["token-limit", "字数の上限"],
  ["test", "単体"],
  ["test:e2e", "E2E"],
])

function stageDisplayName(name: string): string {
  return STAGE_DISPLAY_NAMES.get(name) ?? name
}

/**
 * 段の札の列（届いたときだけ）の下に、通った・確かめていない（止まっている含む）・落ちた の順に1項目1行で並べる。
 * 札の列があるときは、通ったコマンドの検証の行だけを札と重ねて出さない（落ちた・確かめていない行は隠さない）。お願いがあれば末尾に飛び印を添える。
 */
function CheckLines(props: {
  readonly view: ReportChecksView
  readonly verification: ReportVerification
}): ReactElement {
  const { view, verification } = props
  const hasStages = verification.kind === "checked"
  const keep = (row: { readonly viaCommand: boolean }): boolean => !(hasStages && row.viaCommand)
  const rows = view.kind === "checks" ? view : undefined
  const passed = rows === undefined ? [] : rows.passed.filter(keep)
  const problems = rows === undefined ? [] : rows.problems
  const notNg = problems.filter((row) => row.status !== "ng")
  const ng = problems.filter((row) => row.status === "ng")
  return (
    <>
      {verification.kind === "checked" && <StageTags stages={verification.stages} />}
      <div className={hasStages ? styles["check-rest"] : undefined}>
        {passed.map((row, index) => (
          <PassedLine key={`${String(index)}:${row.label}`} row={row} />
        ))}
        {[...notNg, ...ng].map((row, index) => (
          <ProblemLine key={`${String(index)}:${row.label}`} row={row} />
        ))}
      </div>
      {rows !== undefined && <FavorJump favor={rows.summary.favor} />}
    </>
  )
}

function StageTags(props: { readonly stages: readonly VerificationStage[] }): ReactElement {
  return (
    <ul className={styles.stages}>
      {props.stages.map((stage) => (
        <li
          key={stage.name}
          className={clsx(styles.stage, stage.result === "failed" && styles["stage-failed"])}
        >
          {stageDisplayName(stage.name)}
          {stage.count.kind === "counted" && (
            <strong className={styles["stage-count"]}>
              {stage.count.tests.toLocaleString("en-US")}
            </strong>
          )}
        </li>
      ))}
    </ul>
  )
}

function PassedLine(props: { readonly row: ReportCheckPassedRow }): ReactElement {
  const { label, figure } = props.row
  return (
    <div className={workRecordClassName("work-record-check")}>
      <span
        className={clsx(
          workRecordClassName("work-record-check-mark"),
          workRecordClassName("work-record-check-mark-ok"),
        )}
      >
        ✓
      </span>
      <span>{lineText(label, figure)}</span>
    </div>
  )
}

function ProblemLine(props: { readonly row: ReportCheckProblemRow }): ReactElement {
  const { status, label, figure, detail, howToVerify } = props.row
  const tone =
    status === "ng"
      ? workRecordClassName("work-record-check-mark-ng")
      : workRecordClassName("work-record-check-mark-warn")
  return (
    <div className={workRecordClassName("work-record-check")}>
      <span className={clsx(workRecordClassName("work-record-check-mark"), tone)}>
        {REPORT_CHECK_PROBLEM_MARKS[status]}
      </span>
      <span>{lineText(label, figure)}</span>
      {detail !== "" && (
        <span className={workRecordClassName("work-record-check-how")}>{plainInline(detail)}</span>
      )}
      {howToVerify !== "" && (
        <span className={workRecordClassName("work-record-check-how")}>
          {`確かめ方: ${plainInline(howToVerify)}`}
        </span>
      )}
    </div>
  )
}

function lineText(label: string, figure: string): string {
  const text = plainInline(label)
  return figure === "" ? text : `${text}（${plainInline(figure)}）`
}
