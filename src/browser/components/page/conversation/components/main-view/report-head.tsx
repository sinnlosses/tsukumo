// レポートの結論部の頭（タスクの見出しの行とメタの行）。結論の一文はこの下のレポート本文の先頭にある。
// 見出しの行はタスクID・作業の名前・終わり方の札、メタの行はラベル・終えた段のうちあるものだけを描き、1つも無ければ何も描かない。
// 終わり方の `stopped` は描かない。

import clsx from "clsx"
import { Fragment, type ReactElement } from "react"

import type { ReportTask, ReportTaskOutcome } from "../../../../../../shared/report/report-task.ts"
import type { MainViewPhaseLabel } from "../../../../../../shared/session/main-view-shape.ts"
import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { codeSpanParts } from "../../../../../domain/code-span.ts"
import { withOccurrenceKeys } from "../../../../../domain/occurrence-key.ts"
import { useSession } from "../../../../../stores/session.ts"
import { useTaskBoardRequest } from "../../../../../stores/task-board-request.ts"
import { Badge } from "../../../../ui/badge/badge.tsx"
import styles from "./main-view.module.css"

/** タスク見出し行の頭に置く、何のレポートかの語。 */
export type ReportLabel = "none" | "interim" | "final"

type ReportHeadProps = {
  readonly label: ReportLabel
  readonly task: ReportTask
  /** 段のまとめなら、終えた段の見出し。 */
  readonly phase: MainViewPhaseLabel
  /** 置く側が足す class(狭い画面で隠すなど)。 */
  readonly className: string
}

export function ReportHead(props: ReportHeadProps): ReactElement | undefined {
  const { label, task, phase } = props
  if (label === "none" && task.kind === "none" && phase.kind === "none") {
    return undefined
  }

  const meta = [
    ...(label === "none" ? [] : [<span key="label">{LABEL_TEXT[label]}</span>]),
    ...(phase.kind === "none"
      ? []
      : [
          <span key="phase">{phase.label}</span>,
          ...(phase.skipped ? [<span key="phase-skipped">飛ばした</span>] : []),
          <span key="phase-time">所要 {formatMeasured(phase.duration)}</span>,
        ]),
  ]

  return (
    <header className={clsx(styles["report-head"], props.className)}>
      {task.kind !== "none" && (
        <div className={styles["report-title-row"]}>
          <TaskId id={task.id} />
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
          {task.outcome !== "stopped" && <Outcome outcome={task.outcome} />}
        </div>
      )}
      {meta.length > 0 && <p className={styles["report-meta"]}>{meta}</p>}
    </header>
  )
}

const LABEL_TEXT = {
  interim: "中間レポート",
  final: "最終レポート",
} as const satisfies Record<Exclude<ReportLabel, "none">, string>

const OUTCOME_VIEW = {
  finished: { mark: "✓", text: "完了", tone: "ok" },
  "awaiting-answer": { mark: "？", text: "答え待ち", tone: "warn" },
} as const satisfies Record<
  DrawnOutcome,
  { readonly mark: string; readonly text: string; readonly tone: "ok" | "warn" }
>

type DrawnOutcome = Exclude<ReportTaskOutcome, "stopped">

function Outcome(props: { readonly outcome: DrawnOutcome }): ReactElement {
  const view = OUTCOME_VIEW[props.outcome]
  return (
    <Badge tone={view.tone} shape="square" className={styles["report-outcome"]}>
      {view.mark} {view.text}
    </Badge>
  )
}

/** タスクID。一覧にあるタスクなら押すとタスクのモーダルをそのタスクを選んで開き、無ければ字だけ。 */
function TaskId(props: { readonly id: string }): ReactElement {
  const listedId = useSession((session) =>
    session.state.tasks.kind === "known"
      ? session.state.tasks.items.find((item) => item.id.toLowerCase() === props.id.toLowerCase())
          ?.id
      : undefined,
  )
  const openTask = useTaskBoardRequest((state) => state.openTask)

  if (listedId === undefined) {
    return <span className={styles["report-task-id"]}>{props.id}</span>
  }
  return (
    <button
      type="button"
      className={clsx(styles["report-task-id"], styles["report-task-id-link"])}
      aria-haspopup="dialog"
      onClick={() => {
        openTask(listedId)
      }}
    >
      {props.id}
    </button>
  )
}
