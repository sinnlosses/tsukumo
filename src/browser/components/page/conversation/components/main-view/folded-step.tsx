// ステップの本文の描き方。中間レポートを1行に畳んだ形（`FoldedStep`）と、中間・最終の開いた本文（`StepReport`）。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import type { ReportTask } from "../../../../../../shared/report/report-task.ts"
import {
  isInterimStep,
  type MainViewStep,
  type MainViewStepBody,
} from "../../../../../../shared/session/main-view-shape.ts"
import { formatMeasured } from "../../../../../../shared/utils/elapsed-time.ts"
import { withoutPhaseTimes } from "../../../../../domain/main-view/main-view-report-body.ts"
import { Report } from "../../../../../features/report/report.tsx"
import { usePhoneWidth } from "../../../../../hooks/use-phone-width.ts"
import { Text } from "../../../../ui/text/text.tsx"
import { ExpandableHead } from "./expandable-head.tsx"
import { useFavorVisibility } from "./hooks/use-favor-visibility.ts"
import styles from "./main-view.module.css"
import { ReportHead, type ReportLabel } from "./report-head.tsx"

/** `Report` が本文の根に重ねる class（ポンの演出と、ステップ末尾の余白の打ち消しが指す綴り）。 */
const REPORT_CLASS_NAMES = {
  revealClassName: styles["draft-pop"],
  blockClassName: styles["detail-block"],
}

type FoldedStepProps = {
  readonly step: MainViewStep
  readonly turnId: number
  readonly hasInterimReport: boolean
  readonly phoneHidden: boolean
}

/** 中間レポートを `<summary>` の1行に畳んだ形。 */
export function FoldedStep(props: FoldedStepProps): ReactElement {
  const [opened, setOpened] = useState(false)
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setOpened(true)
        }
      }}
      className={clsx(
        styles["main-step"],
        styles["is-interim"],
        props.phoneHidden && styles["phone-hidden"],
      )}
    >
      <Text
        element="summary"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["step-heading"]}
      >
        <InterimSummary body={props.step.body} />
      </Text>
      {opened && (
        <StepReport
          step={props.step}
          turnId={props.turnId}
          reveal={false}
          latest={false}
          hasInterimReport={props.hasInterimReport}
          folded
          phoneHidden={props.phoneHidden}
        />
      )}
    </details>
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
      phase={step.body.finishedPhase}
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
        reportToolUseId={step.origin.kind === "tool-report" ? step.origin.toolUseId : undefined}
        nextSteps={
          props.latest && !props.phoneHidden
            ? {
                sessionRemaining: step.body.sessionRemaining ?? { kind: "unrecorded" },
                ...(step.body.task.kind === "task" ? { outcome: step.body.task.outcome } : {}),
              }
            : undefined
        }
        favorMark={phoneWidth ? "inline" : "none"}
        favorRef={props.latest && !props.phoneHidden && !phoneWidth ? favorRef : undefined}
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
