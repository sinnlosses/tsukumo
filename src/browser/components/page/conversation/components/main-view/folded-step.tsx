// ステップの本文の描き方。中間レポートを1行に畳んだ形（`FoldedStep`）と、中間・最終の開いた本文（`StepReport`）。

import { useState, type ReactElement } from "react"

import type { ReportTask } from "../../../../../../shared/report/report-task.ts"
import {
  isInterimStep,
  type MainViewStep,
  type MainViewStepBody,
} from "../../../../../../shared/session/main-view-shape.ts"
import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { withoutPhaseTimes } from "../../../../../domain/main-view/main-view-report-body.ts"
import {
  nextStepsOfReport,
  nextTaskCandidatesOf,
  type NextStep,
} from "../../../../../features/report/next-step.ts"
import { Report } from "../../../../../features/report/report.tsx"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { useSession } from "../../../../../stores/session.ts"
import { Disclosure } from "../../../../ui/disclosure/disclosure.tsx"
import { nextStepReportKey } from "../../stores/next-step-tray.ts"
import { REPORT_STEP_ATTRIBUTE } from "./domain/outline-report-head.ts"
import { ExpandableHead } from "./expandable-head.tsx"
import { useFavorVisibility } from "./hooks/use-favor-visibility.ts"
import { useNextStepTraySource } from "./hooks/use-next-step-tray-source.ts"
import styles from "./main-view.module.css"
import { ReportHead, type ReportLabel } from "./report-head.tsx"

/** `Report` が本文の根に重ねる class（ポンの演出と、ステップ末尾の余白の打ち消しが指す綴り）。 */
const REPORT_CLASS_NAMES = {
  revealClassName: styles["draft-pop"],
  blockClassName: styles["detail-block"],
}

const NO_NEXT_STEPS: readonly NextStep[] = []

type FoldedStepProps = {
  readonly step: MainViewStep
  readonly turnId: number
  readonly hasInterimReport: boolean
  readonly phoneHidden: boolean
}

/** 中間レポートを `<summary>` の1行に畳める形。既定は開いている。 */
export function FoldedStep(props: FoldedStepProps): ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <Disclosure
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
      }}
      gap="block"
      hiddenOnNarrow={props.phoneHidden}
      summaryTone="ink-quiet"
      summarySize="label"
      className={`${styles["main-step"]} ${styles["is-interim"]}`}
      summaryClassName={styles["step-heading"]}
      attributes={{ [REPORT_STEP_ATTRIBUTE]: "" }}
      summary={<InterimSummary body={props.step.body} />}
    >
      <StepReport
        step={props.step}
        turnId={props.turnId}
        reveal={false}
        latest={false}
        hasInterimReport={props.hasInterimReport}
        folded
        phoneHidden={props.phoneHidden}
      />
    </Disclosure>
  )
}

type StepReportProps = {
  readonly step: MainViewStep
  readonly turnId: number
  readonly reveal: boolean
  readonly latest: boolean
  readonly hasInterimReport: boolean
  readonly folded: boolean
  /** 狭い画面で本文を隠すか。 */
  readonly phoneHidden: boolean
}

export function StepReport(props: StepReportProps): ReactElement | undefined {
  const { step } = props
  const phoneWidth = usePhoneWidth()
  const favorRef = useFavorVisibility()
  // 次の一手と押せるお願いの選択肢は、最新のやり取りの最終レポートだけが持つ。
  const replyable = props.latest && !props.phoneHidden
  const tasks = useSession((session) => session.state.tasks)
  useNextStepTraySource(
    nextStepReportKey(props.turnId, step.id),
    replyable && step.body.kind === "text"
      ? nextStepsOfReport(step.body.report, {
          sessionRemaining: step.body.sessionRemaining ?? { kind: "unrecorded" },
          ...(step.body.task.kind === "task"
            ? {
                outcome: step.body.task.outcome,
                nextTasks: nextTaskCandidatesOf(tasks, step.body.task.id),
              }
            : {}),
        })
      : NO_NEXT_STEPS,
  )
  if (step.body.kind !== "text") {
    return undefined
  }
  // 広い画面の最新のやり取りの所要時間は「手順」の一覧の末尾が持つ
  const body =
    props.latest && !phoneWidth
      ? { ...step.body, report: withoutPhaseTimes(step.body.report) }
      : step.body
  const phoneHidden = props.phoneHidden ? styles["phone-hidden"] : ""
  const label = reportLabel(step, step.body.task, props.hasInterimReport, props.folded)
  const head = (
    <ReportHead
      label={label}
      task={step.body.task}
      phase={props.folded ? { kind: "none" } : step.body.finishedPhase}
      className={phoneHidden}
    />
  )
  return (
    <>
      {label === "final" && !props.phoneHidden ? (
        <ExpandableHead
          body={body}
          turnId={props.turnId}
          head={head}
          reportClassNames={REPORT_CLASS_NAMES}
        />
      ) : (
        head
      )}
      <Report
        body={body.report}
        reveal={props.reveal}
        turnId={props.turnId}
        className={phoneHidden}
        favorPressable={replyable}
        favorMark={phoneWidth ? "inline" : "none"}
        favorRef={replyable && !phoneWidth ? favorRef : undefined}
        {...REPORT_CLASS_NAMES}
      />
    </>
  )
}

/**
 * タスク見出し行の頭に置くラベル。
 * 畳んだ中間レポートは `<summary>` がラベルを持つので置かない。
 * 最終レポートのラベルは、中間レポートのあるやり取りか、`task` があるときだけ。
 */
function reportLabel(
  step: MainViewStep,
  task: ReportTask,
  hasInterimReport: boolean,
  folded: boolean,
): ReportLabel {
  if (isInterimStep(step)) {
    return folded ? "none" : "interim"
  }
  return step.mark === "final" && (hasInterimReport || task.kind === "task") ? "final" : "none"
}

/**
 * 畳んだ中間レポートの `<summary>` の中身。
 * 済んだフェーズは、印・「n/N 名前」・飛ばしたか・所要（右寄せ）の1行。先頭行が無ければラベルだけ。
 */
function InterimSummary(props: { readonly body: MainViewStepBody }): ReactElement {
  const { body } = props
  if (body.kind === "none" || body.firstLine === "") {
    return <>中間レポート</>
  }
  if (body.finishedPhase.kind !== "phase") {
    return <>{body.firstLine}</>
  }
  const { skipped, duration } = body.finishedPhase
  return (
    <>
      <span aria-hidden="true">{skipped ? "－" : "✓"}</span> {body.firstLine}
      <span className={styles["step-heading-time"]}>
        {skipped ? " 飛ばした" : ""} 所要 {formatMeasured(duration)}
      </span>
    </>
  )
}
