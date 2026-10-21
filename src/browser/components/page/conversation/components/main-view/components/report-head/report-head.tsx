// レポートの結論部の頭（目録の1行と見出し）。結論の一文はこの下のレポート本文の先頭にある。
// 目録の1行はラベル・終えた段・タスクID・終わり方・変更の札のうちあるものだけを `·` でつなぎ、1つも無ければ何も描かない。
// 終わり方の `stopped` は描かない。

import clsx from "clsx"
import { Fragment, type ReactElement } from "react"

import type {
  ReportChangeCount,
  ReportChangeSummary,
} from "../../../../../../../../shared/report/report-change-summary.ts"
import type {
  ReportTask,
  ReportTaskOutcome,
} from "../../../../../../../../shared/report/report-task.ts"
import type { MainViewPhaseLabel } from "../../../../../../../../shared/session/main-view-shape.ts"
import { formatMeasured } from "../../../../../../../../shared/utils/elapsed-time.ts"
import { codeSpanParts } from "../../../../../../../domain/code-span.ts"
import { withOccurrenceKeys } from "../../../../../../../domain/occurrence-key.ts"
import { useSession } from "../../../../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../../../../stores/task-board-request.ts"
import styles from "./report-head.module.css"

/** 目録の頭に置く、何のレポートかの語。 */
export type ReportLabel = "none" | "interim" | "final"

type ReportHeadProps = {
  readonly label: ReportLabel
  readonly task: ReportTask
  /** 段のまとめなら、終えた段の見出し。 */
  readonly phase: MainViewPhaseLabel
  /** 目録の末尾に出す変更の札。 */
  readonly changeSummary: ReportChangeSummary
  /** 置く側が足す class(狭い画面で隠すなど)。 */
  readonly className: string
}

export function ReportHead(props: ReportHeadProps): ReactElement | null {
  const { label, task, phase, changeSummary } = props
  if (
    label === "none" &&
    task.kind === "none" &&
    phase.kind === "none" &&
    changeSummary.kind === "none"
  ) {
    return null
  }

  const items = [
    ...(label === "none" ? [] : [<span key="label">{LABEL_TEXT[label]}</span>]),
    ...(phase.kind === "none"
      ? []
      : [
          <span key="phase">{phase.label}</span>,
          ...(phase.skipped ? [<span key="phase-skipped">飛ばした</span>] : []),
          <span key="phase-time">所要 {formatMeasured(phase.duration)}</span>,
        ]),
    ...(task.kind === "none"
      ? []
      : [
          <TaskId id={task.id} key="id" />,
          ...(task.outcome === "stopped" ? [] : [<Outcome outcome={task.outcome} key="outcome" />]),
        ]),
    ...(changeSummary.kind === "none"
      ? []
      : [<ChangeSummary summary={changeSummary} key="change-summary" />]),
  ]

  return (
    <header className={clsx(styles["report-head"], props.className)}>
      <p className={styles["report-catalog"]}>
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 && (
              <span className={styles["report-catalog-separator"]} aria-hidden="true">
                ·
              </span>
            )}
            {item}
          </Fragment>
        ))}
      </p>
      {task.kind === "task" && (
        <h3 className={styles["report-headline"]}>
          {withOccurrenceKeys(codeSpanParts(task.name), (part) => part.text).map(
            ({ key, item: part }) =>
              part.kind === "code" ? (
                <code key={key} className={styles["report-headline-code"]}>
                  {part.text}
                </code>
              ) : (
                <Fragment key={key}>{part.text}</Fragment>
              ),
          )}
        </h3>
      )}
    </header>
  )
}

const LABEL_TEXT = {
  interim: "中間レポート",
  final: "最終レポート",
} as const satisfies Record<Exclude<ReportLabel, "none">, string>

const OUTCOME_VIEW = {
  finished: { mark: "✓", text: "完了", className: "report-outcome-finished" },
  "awaiting-answer": { mark: "？", text: "答え待ち", className: "report-outcome-awaiting-answer" },
} as const satisfies Record<
  DrawnOutcome,
  { readonly mark: string; readonly text: string; readonly className: string }
>

type DrawnOutcome = Exclude<ReportTaskOutcome, "stopped">

function Outcome(props: { readonly outcome: DrawnOutcome }): ReactElement {
  const view = OUTCOME_VIEW[props.outcome]
  return (
    <span className={clsx(styles["report-outcome"], styles[view.className])}>
      {view.mark} {view.text}
    </span>
  )
}

/** 変更の札「変更 n ファイル +a −b」。`−` は U+2212。範囲に別の変更が混ざりうるときは末尾に控えめな注記を添える。 */
function ChangeSummary(props: { readonly summary: ReportChangeCount }): ReactElement {
  const { files, added, removed, mixed } = props.summary
  return (
    <span className={styles["report-change-summary"]}>
      変更 {files} ファイル <span className={styles["report-change-added"]}>+{added}</span>{" "}
      <span className={styles["report-change-removed"]}>−{removed}</span>
      {mixed && <span className={styles["report-change-mixed"]}> ※他の変更を含みうる</span>}
    </span>
  )
}

/** タスクID。一覧にあるタスクなら押すとタスクのモーダルをそのタスクを選んで開き、無ければ字だけ。 */
function TaskId(props: { readonly id: string }): ReactElement {
  const listed = useSession(
    (session) =>
      session.state.tasks.kind === "known" &&
      session.state.tasks.items.some((item) => item.id === props.id),
  )
  const openTask = useTaskBoardRequest((state) => state.openTask)

  if (!listed) {
    return <span className={styles["report-task-id"]}>{props.id}</span>
  }
  return (
    <button
      type="button"
      className={clsx(styles["report-task-id"], styles["report-task-id-link"])}
      aria-haspopup="dialog"
      onClick={() => {
        openTask(props.id)
      }}
    >
      {props.id}
    </button>
  )
}
