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
} from "../hooks/use-current-work.ts"
import styles from "./current-work-list.module.css"
import { CurrentWorkStepGroup } from "./current-work-step-group.tsx"

export type CurrentWorkListProps = {
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
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
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
          <ol className={styles["current-work-plan"]}>
            {work.plan.phases.map((phase) => (
              <CurrentWorkPlanPhase key={phase.key} phase={phase} />
            ))}
          </ol>
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
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup={undefined}
              title={undefined}
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

/** 段取りの段1つ。済んだ・今・残りの見分けは頭の字（済 / 今 / 番号）が持ち、枠と地は補助。 */
function CurrentWorkPlanPhase(props: { readonly phase: CurrentWorkPlanPhase }): ReactElement {
  const { phase } = props
  return (
    <li
      className={clsx(
        styles["current-work-plan-phase"],
        phase.state === "done" && styles["current-work-plan-phase-done"],
        phase.state === "current" && styles["current-work-plan-phase-current"],
      )}
    >
      <b>{phase.mark}</b>
      {phase.name}
    </li>
  )
}

/**
 * 背景のタスク1件。印は実行中の手順と同じ回る「…」（動いているものの印を2種類にしない）。
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
