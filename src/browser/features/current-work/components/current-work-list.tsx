// 依頼の手順の一覧。札「いまの作業」を押すと開く中身。
//
// どこに重ねるか（位置・幅・高さの上限）は置く側が `className` で決め、ここは一覧の箱と中身だけを持つ。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import type {
  CurrentWork,
  CurrentWorkBackgroundTask,
  CurrentWorkPlanPhase,
  CurrentWorkPlanSpan,
} from "../hooks/use-current-work.ts"
import styles from "./current-work-list.module.css"
import { CurrentWorkStepGroup } from "./current-work-step-group.tsx"

type CurrentWorkListProps = {
  /** 開く口の `aria-controls` が指す id。 */
  readonly id: string
  readonly work: CurrentWork
  readonly className: string
}

/** 答え待ちのときに一覧へ出す口。 */
const GO_TO_INQUIRY_LABEL = "お伺いへ"

export function CurrentWorkList(props: CurrentWorkListProps): ReactElement {
  const { work } = props

  return (
    <div id={props.id} className={clsx(styles["current-work-list"], props.className)} role="region">
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="semibold"
        className={styles["current-work-heading"]}
      >
        {work.wordLabel}
      </Text>
      {work.pendingHint.kind === "inquiry" && (
        <Button
          variant="link"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["current-work-go-to-inquiry"]}
          onClick={work.pendingHint.onGoToInquiry}
        >
          {GO_TO_INQUIRY_LABEL}
        </Button>
      )}
      {work.plan.kind === "planned" && (
        <>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["current-work-plan-heading"]}
          >
            {work.plan.headingLabel}
          </Text>
          <div className={styles["current-work-plan-spans"]}>
            {work.plan.spans.map((span) => (
              <CurrentWorkPlanSpan key={span.key} span={span} />
            ))}
          </div>
        </>
      )}
      {work.runningStep.kind !== "none" && (
        <div className={styles["current-work-full"]}>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["current-work-full-heading"]}
          >
            実行中の {work.runningStep.toolName}
          </Text>
          <pre className={styles["current-work-full-text"]}>
            <code>{work.runningStep.fullText}</code>
          </pre>
        </div>
      )}
      {work.backgroundList.kind === "tasks" && (
        <>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["current-work-background-heading"]}
          >
            {work.backgroundList.headingLabel}
          </Text>
          <ul className={styles["current-work-background"]}>
            {work.backgroundList.tasks.map((task) => (
              <CurrentWorkBackgroundRow key={task.key} task={task} />
            ))}
          </ul>
        </>
      )}
      {work.stepList.kind === "steps" ? (
        <>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["current-work-steps-heading"]}
          >
            {work.stepList.headingLabel}
          </Text>
          {work.stepList.groups.map((group) => (
            <CurrentWorkStepGroup key={group.key} group={group} />
          ))}
          {work.stepList.toggleAll.kind === "expandable" && (
            <Button
              variant="link"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["current-work-toggle-all"]}
              onClick={work.stepList.onToggleExpanded}
            >
              {work.stepList.toggleAll.label}
            </Button>
          )}
        </>
      ) : (
        <Text element="p" size="inherit" tone="ink-quiet" weight="inherit" className="">
          {work.stepList.kind === "no-request"
            ? "まだ依頼が無い"
            : "この依頼ではまだツールを使っていない"}
        </Text>
      )}
    </div>
  )
}

/** ワークプランの群1行（前・本・後）。範囲が無い依頼は群の名を持たず、行の頭の名を出さない。 */
function CurrentWorkPlanSpan(props: { readonly span: CurrentWorkPlanSpan }): ReactElement {
  const { span } = props
  return (
    <div className={styles["current-work-plan-span"]}>
      {span.name !== "" && (
        <span
          className={clsx(
            styles["current-work-plan-span-name"],
            span.current && styles["current-work-plan-span-current"],
          )}
        >
          {span.name}
        </span>
      )}
      <ol className={styles["current-work-plan"]}>
        {span.phases.map((phase) => (
          <CurrentWorkPlanPhase key={phase.key} phase={phase} />
        ))}
      </ol>
    </div>
  )
}

/** ワークプランの段1つ。済んだ・今・残りの見分けは頭の丸（✓ / 差し色の番号 / 番号）が持ち、枠と地は補助。 */
function CurrentWorkPlanPhase(props: { readonly phase: CurrentWorkPlanPhase }): ReactElement {
  const { phase } = props
  return (
    <li
      className={clsx(
        styles["current-work-plan-phase"],
        phase.state === "done" && styles["current-work-plan-phase-done"],
        phase.skipped && styles["current-work-plan-phase-skipped"],
        phase.state === "current" && styles["current-work-plan-phase-current"],
      )}
    >
      <b>{phase.mark}</b>
      {phase.name}
    </li>
  )
}

/**
 * バックグラウンドタスク1件。印は実行中の手順と同じ回る「…」（動いているものの印を2種類にしない）。
 * 種類の語は手順のツール名と同じ等幅の列に置く。
 */
function CurrentWorkBackgroundRow(props: {
  readonly task: CurrentWorkBackgroundTask
}): ReactElement {
  const { task } = props
  return (
    <li>
      <span className={styles["current-work-background-mark"]} aria-hidden="true">
        …
      </span>{" "}
      <Text
        element="span"
        size="inherit"
        tone="inherit"
        weight="inherit"
        className={styles["current-work-background-kind"]}
      >
        {task.kindLabel}
      </Text>
      {task.description !== "" && ` ${task.description}`}
    </li>
  )
}
