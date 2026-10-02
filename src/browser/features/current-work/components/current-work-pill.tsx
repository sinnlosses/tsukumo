// 札「いまの作業」と、押すと開く依頼の手順の一覧。
//
// 同じ部品を2箇所に置いてよい。開閉の状態は1つの hook が持つので、どちらから押しても同じ一覧が開く。
// id は `useId()` でこの器ごとに振る（`aria-controls` が指す一覧の id が重ならないようにする）。
// Esc の戻り先として札の DOM を預ける口（`work.toggleRef`）も、2箇所ぶんを集めるコールバック ref。

import clsx from "clsx"
import { useId, type ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import type {
  CurrentWork,
  CurrentWorkBackgroundTask,
  CurrentWorkPlanPhase,
} from "../hooks/use-current-work.ts"
import styles from "./current-work-pill.module.css"
import { CurrentWorkStepGroup } from "./current-work-step-group.tsx"

/**
 * 札の形。
 * `dropdown` は一覧が札の真下に重なって開く。`inline` は札が幅いっぱいで、一覧がその場で下に広がる。
 */
export type CurrentWorkVariant = "dropdown" | "inline"

export type CurrentWorkPillProps = {
  readonly work: CurrentWork
  readonly variant: CurrentWorkVariant
}

/** 答え待ちが質問のときに一覧へ出す口。 */
const GO_TO_QUESTION_LABEL = "質問へ"

export function CurrentWorkPill(props: CurrentWorkPillProps): ReactElement {
  const { work } = props
  // 預け先はここで分解して受ける。
  // `work.toggleRef` の形のまま `ref` に渡すと、`react(refs)` が `work` への参照ごとレンダー中の ref の読み書きとみなして落ちる。
  const { toggleRef } = work
  const listId = useId()

  return (
    <div
      className={styles["current-work"]}
      data-work-state={work.state}
      data-chat-idle={work.chatIdle}
      data-variant={props.variant}
    >
      <button
        type="button"
        ref={toggleRef}
        className={styles["current-work-toggle"]}
        aria-expanded={work.open}
        aria-controls={listId}
        onClick={work.onToggle}
      >
        <span className={styles["current-work-mark"]} aria-hidden="true">
          {work.mark}
        </span>
        <span className={styles["current-work-word"]}>{work.wordLabel}</span>
        {work.phase.kind === "shown" && (
          <>
            <span className={styles["current-work-sep"]} aria-hidden="true" />
            <Text
              element="span"
              size="inherit"
              tone="ink"
              weight="inherit"
              className={styles["current-work-phase"]}
            >
              {work.phase.label}
            </Text>
          </>
        )}
        {work.summary.kind === "text" && (
          <>
            <span className={styles["current-work-sep"]} aria-hidden="true" />
            <Text
              element="span"
              size="inherit"
              tone="inherit"
              weight="inherit"
              className={styles["current-work-summary"]}
            >
              {work.summary.label}
            </Text>
          </>
        )}
      </button>
      {work.open && <CurrentWorkList id={listId} work={work} />}
    </div>
  )
}

function CurrentWorkList(props: { readonly id: string; readonly work: CurrentWork }): ReactElement {
  const { work } = props

  return (
    <div id={props.id} className={styles["current-work-list"]} role="region">
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="semibold"
        className={styles["current-work-heading"]}
      >
        {work.wordLabel}
        {work.pendingHint.kind === "input" ? "。入力欄の上で答えられる" : ""}
      </Text>
      {work.pendingHint.kind === "question" && (
        <Button
          variant="link"
          size="label"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["current-work-go-to-question"]}
          onClick={work.pendingHint.onGoToQuestion}
        >
          {GO_TO_QUESTION_LABEL}
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
