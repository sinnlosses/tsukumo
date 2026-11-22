// 進み具合のプログレスバーの「手順」で開く、依頼全体の詳細の中身。
// 見出し・ワークフローの図・バックグラウンドタスクの区画・フェーズの行・どの行にも付かない手順・所要時間の帯・下端の経過を並べる。

import clsx from "clsx"
import type { ReactElement } from "react"

import { CurrentWorkBackground } from "../../../../../features/current-work/current-work-background.tsx"
import { CurrentWorkStepGroup } from "../../../../../features/current-work/current-work-step-group.tsx"
import {
  detailBlockClassName,
  phaseTimesClassName,
} from "../../../../../features/report/markdown.tsx"
import { PhaseTimeSummary } from "../../../../../features/report/report.tsx"
import { Disclosure } from "../../../../ui/disclosure/disclosure.tsx"
import type { StepsLanding } from "../../stores/work-strip-step-list.ts"
import type { StepsPlanItem } from "./domain/steps-plan-card.ts"
import { useStepsLanding } from "./hooks/use-steps-landing.ts"
import type { WorkStripSteps } from "./hooks/use-work-strip-step-list.ts"
import styles from "./main-view.module.css"
import { PresentationalWorkflowDiagrams } from "./presentational-workflow-diagram.tsx"

/**
 * 押すと開く依頼の全体の詳細。ワークプランのフェーズを並べ、行の下にそのフェーズの手順を置く。
 * 失敗した手順・段を指して開いたときは、その行・区切りへ連れてくる。
 */
export function PresentationalStepsList(props: {
  readonly id: string
  readonly steps: WorkStripSteps
  readonly landing: StepsLanding
}): ReactElement {
  const { steps } = props
  const listRef = useStepsLanding(props.landing)
  return (
    <div
      ref={listRef}
      id={props.id}
      role="region"
      aria-label="依頼の手順"
      className={styles["work-strip-steps"]}
    >
      <p className={styles["work-strip-steps-head"]}>
        <span>依頼の手順</span>
        {steps.phaseCountLabel !== "" && <span>{steps.phaseCountLabel}</span>}
      </p>
      <PresentationalWorkflowDiagrams steps={steps} />
      <CurrentWorkBackground list={steps.backgroundList} runningMark="still" />
      {steps.card.length > 0 && (
        <ol className={styles["work-strip-plan"]}>
          {steps.card.map((item) => (
            <PlanItem key={itemKeyOf(item)} item={item} steps={steps} />
          ))}
        </ol>
      )}
      {steps.rest.map((group) => (
        <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
      ))}
      {steps.phaseTimes.kind === "times" && (
        <div className={clsx(detailBlockClassName, styles["work-strip-phase-times"])}>
          <div className={phaseTimesClassName("phase-times")}>
            <PhaseTimeSummary view={steps.phaseTimes} />
          </div>
        </div>
      )}
      {steps.estimate.kind === "shown" && (
        <p className={styles["work-strip-steps-foot"]}>
          <span
            className={styles["work-strip-steps-foot-eta"]}
            title="済んだフェーズの所要から出した目安"
          >
            目安の残り{" "}
            <b>
              {steps.estimate.low}〜{steps.estimate.high}分
            </b>
          </span>
        </p>
      )}
    </div>
  )
}

function itemKeyOf(item: StepsPlanItem): string {
  if (item.kind === "phase") {
    return item.row.key
  }
  return item.kind
}

function PlanItem(props: {
  readonly item: StepsPlanItem
  readonly steps: WorkStripSteps
}): ReactElement {
  const { item, steps } = props
  if (item.kind === "done-fold") {
    return (
      <li className={styles["work-strip-plan-fold"]}>
        <button
          type="button"
          className={styles["work-strip-plan-more"]}
          onClick={steps.onExpandDone}
        >
          <span>済んだ {String(item.count)} フェーズ</span>
          {item.total !== "" && (
            <span className={styles["work-strip-plan-time"]}>{item.total}</span>
          )}
        </button>
      </li>
    )
  }
  if (item.kind === "upcoming-rest") {
    return (
      <li className={clsx(styles["work-strip-plan-fold"], styles["work-strip-plan-note"])}>
        ほか {String(item.count)} フェーズ
      </li>
    )
  }
  return <PhaseRow item={item} onExpandSteps={steps.onExpandSteps} />
}

/** フェーズの行。印・名前・所要と、済んだフェーズのまとめ、その下の手順（済んだフェーズは畳み、今のフェーズは開く）。これからのフェーズは名前だけ。 */
function PhaseRow(props: {
  readonly item: Extract<StepsPlanItem, { readonly kind: "phase" }>
  readonly onExpandSteps: () => void
}): ReactElement {
  const { item, onExpandSteps } = props
  const { row, groups } = item
  return (
    <li
      className={styles["work-strip-plan-row"]}
      data-phase-indexes={String(row.phaseIndex)}
      data-phase-state={row.state}
      data-phase-skipped={row.skipped ? "true" : undefined}
    >
      <p className={styles["work-strip-plan-head"]}>
        <span aria-hidden="true" className={styles["work-strip-plan-mark"]}>
          {row.mark}
        </span>
        {row.spanName !== "" && <span className={styles["work-strip-span"]}>{row.spanName}</span>}
        {row.parallelLabel !== "" && (
          <span className={styles["work-strip-span"]}>{row.parallelLabel}</span>
        )}
        <span className={styles["work-strip-plan-name"]}>
          {row.name}
          {row.skipped && "（飛ばした）"}
        </span>
        {row.duration !== "" && (
          <span className={styles["work-strip-plan-time"]}>{row.duration}</span>
        )}
      </p>
      {row.summary !== "" && <p className={styles["work-strip-plan-summary"]}>{row.summary}</p>}
      {row.stepCount > 0 && (
        <Disclosure
          open={row.open}
          gap="none"
          hiddenOnNarrow={false}
          summaryTone="inherit"
          summarySize="inherit"
          className={styles["work-strip-plan-steps"]}
          summaryClassName=""
          summary={`手順 ${String(row.stepCount)}`}
        >
          {groups.map((group) => (
            <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
          ))}
          {item.hiddenStepCount > 0 && (
            <button
              type="button"
              className={styles["work-strip-plan-more"]}
              onClick={onExpandSteps}
            >
              手順 {String(row.stepCount)}件をすべて見る
            </button>
          )}
        </Disclosure>
      )}
    </li>
  )
}
