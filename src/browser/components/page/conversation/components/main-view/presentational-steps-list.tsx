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
import { Badge } from "../../../../ui/badge/badge.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Collapsible } from "../../../../ui/collapsible/collapsible.tsx"
import { Step, Stepper } from "../../../../ui/stepper/stepper.tsx"
import type { StepsLanding } from "../../stores/work-strip-step-list.ts"
import type { StepsPlanItem } from "./domain/steps-plan-card.ts"
import { useStepsLanding } from "./hooks/use-steps-landing.ts"
import type { WorkStripSteps } from "./hooks/use-work-strip-step-list.ts"
import styles from "./main-view.module.css"
import { PresentationalWorkflowDiagrams } from "./presentational-workflow-diagram.tsx"

type PhaseItem = Extract<StepsPlanItem, { readonly kind: "phase" }>
type FoldItem = Exclude<StepsPlanItem, PhaseItem>

/** フェーズの行が続く1まとまり（縦の `Stepper` 1本）か、そのあいだに挟まる畳みの行1つ。 */
type PlanRun =
  | { readonly kind: "phases"; readonly key: string; readonly items: readonly PhaseItem[] }
  | { readonly kind: "fold"; readonly key: string; readonly item: FoldItem }

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
        {steps.phaseCountLabel !== "" && (
          <Badge tone="neutral" shape="pill" className="">
            {steps.phaseCountLabel}
          </Badge>
        )}
      </p>
      <PresentationalWorkflowDiagrams steps={steps} />
      {steps.phaseTimes.kind === "times" && (
        <div className={clsx(detailBlockClassName, styles["work-strip-phase-times"])}>
          <div className={phaseTimesClassName("phase-times")}>
            <PhaseTimeSummary view={steps.phaseTimes} />
          </div>
        </div>
      )}
      <CurrentWorkBackground list={steps.backgroundList} runningMark="still" />
      {runsOf(steps.card).map((run) => (
        <PlanRun key={run.key} run={run} steps={steps} />
      ))}
      {steps.rest.map((group) => (
        <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
      ))}
      {steps.estimate.kind === "shown" && (
        <p className={styles["work-strip-steps-foot"]}>
          <span
            className={styles["work-strip-steps-foot-eta"]}
            title="済んだフェーズの所要から出した目安"
          >
            <Badge tone="accent" shape="pill" className="">
              目安の残り {steps.estimate.low}〜{steps.estimate.high}分
            </Badge>
          </span>
        </p>
      )}
    </div>
  )
}

function runsOf(card: readonly StepsPlanItem[]): readonly PlanRun[] {
  const runs: PlanRun[] = []
  for (const item of card) {
    if (item.kind !== "phase") {
      runs.push({ kind: "fold", key: item.kind, item })
      continue
    }
    const last = runs.at(-1)
    if (last?.kind === "phases") {
      runs[runs.length - 1] = { ...last, items: [...last.items, item] }
    } else {
      runs.push({ kind: "phases", key: item.row.key, items: [item] })
    }
  }
  return runs
}

/** 今のフェーズがあればその位置、無い並びでは最初の済みでない行の位置（全部済みなら行数）。 */
function activeStepOf(items: readonly PhaseItem[]): number {
  const current = items.findIndex(({ row }) => row.state === "current" || row.state === "asking")
  if (current >= 0) return current
  const firstOpen = items.findIndex(({ row }) => row.state !== "done")
  return firstOpen >= 0 ? firstOpen : items.length
}

function PlanRun(props: { readonly run: PlanRun; readonly steps: WorkStripSteps }): ReactElement {
  const { run, steps } = props
  if (run.kind === "fold") {
    return <FoldRow item={run.item} onExpandDone={steps.onExpandDone} />
  }
  const activeStep = activeStepOf(run.items)
  return (
    <div className={styles["work-strip-plan"]}>
      <Stepper
        label="フェーズ"
        activeStep={activeStep}
        density="compact"
        textSize="secondary"
        emphasizeActive
      >
        {run.items.map((item, position) => (
          <PhaseRow
            key={item.row.key}
            item={item}
            position={position}
            onExpandSteps={steps.onExpandSteps}
          />
        ))}
      </Stepper>
    </div>
  )
}

function FoldRow(props: {
  readonly item: FoldItem
  readonly onExpandDone: () => void
}): ReactElement {
  const { item } = props
  if (item.kind === "done-fold") {
    return (
      <div className={styles["work-strip-plan-fold"]}>
        <Button
          variant="link"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["work-strip-plan-more"]}
          onClick={props.onExpandDone}
        >
          済んだ {String(item.count)} フェーズ{item.total === "" ? "" : ` ${item.total}`}
        </Button>
      </div>
    )
  }
  return (
    <p className={clsx(styles["work-strip-plan-fold"], styles["work-strip-plan-note"])}>
      ほか {String(item.count)} フェーズ
    </p>
  )
}

/** フェーズの行。名前・所要・答え待ちの札と、済んだフェーズのまとめ、その下の手順（済んだフェーズは畳み、今のフェーズは開く）。これからのフェーズは名前だけ。 */
function PhaseRow(props: {
  readonly item: PhaseItem
  readonly position: number
  readonly onExpandSteps: () => void
}): ReactElement {
  const { item, position, onExpandSteps } = props
  const { row, groups } = item
  return (
    <Step
      step={position}
      label={`${row.name}${row.skipped ? "（飛ばした）" : ""}`}
      end={
        <>
          {row.spanName !== "" && <span className={styles["work-strip-span"]}>{row.spanName}</span>}
          {row.parallelLabel !== "" && (
            <span className={styles["work-strip-span"]}>{row.parallelLabel}</span>
          )}
          {row.state === "asking" && (
            <Badge tone="warn" shape="pill" className="">
              答え待ち
            </Badge>
          )}
          {row.duration !== "" && (
            <span className={styles["work-strip-plan-time"]}>{row.duration}</span>
          )}
        </>
      }
    >
      <div
        className={styles["work-strip-plan-body"]}
        data-phase-indexes={String(row.phaseIndex)}
        data-phase-state={row.state}
        data-phase-skipped={row.skipped ? "true" : undefined}
      >
        {row.summary !== "" && <p className={styles["work-strip-plan-summary"]}>{row.summary}</p>}
        {row.stepCount > 0 && (
          <Collapsible
            key={String(item.open)}
            chevronPosition="start"
            defaultOpen={item.open}
            textSize="label"
            trigger={`手順 ${String(row.stepCount)}`}
          >
            {groups.map((group) => (
              <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
            ))}
            {item.hiddenStepCount > 0 && (
              <Button
                variant="link"
                size="label"
                pressed="none"
                disabled={false}
                disclosure={{ kind: "none" }}
                className={styles["work-strip-plan-more"]}
                onClick={onExpandSteps}
              >
                手順 {String(row.stepCount)}件をすべて見る
              </Button>
            )}
          </Collapsible>
        )}
      </div>
    </Step>
  )
}
