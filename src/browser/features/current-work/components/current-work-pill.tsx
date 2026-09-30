// 札「いまの作業」と、押すと開く依頼の手順の一覧。
//
// 同じ部品を2箇所に置いてよい。開閉の状態は1つの hook が持つので、どちらから押しても同じ一覧が開く。
// id は `useId()` でこの器ごとに振る（`aria-controls` が指す一覧の id が重ならないようにする）。
// Esc の戻り先として札の DOM を預ける口（`work.toggleRef`）も、2箇所ぶんを集めるコールバック ref。
//
// 失敗した手順の引数と出力を読める場所はここだけ。

import clsx from "clsx"
import { useId, useRef, type ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { useCurrentWorkListMaxHeight } from "../hooks/use-current-work-list-max-height.ts"
import type {
  CurrentWork,
  CurrentWorkBackgroundTask,
  CurrentWorkPlanPhase,
  CurrentWorkStep,
  CurrentWorkStepGroup,
} from "../hooks/use-current-work.ts"
import styles from "./current-work-pill.module.css"

/**
 * 札の形。
 * `dropdown` は一覧が札の真下に重なって開く。`inline` は札が幅いっぱいで、一覧がその場で下に広がる。
 * `capsule` は一覧を札の上へ開き、動いている間は印を回る輪にする。
 */
export type CurrentWorkVariant = "dropdown" | "inline" | "capsule"

export type CurrentWorkPillProps = {
  readonly work: CurrentWork
  readonly variant: CurrentWorkVariant
}

/** 回る輪を印にする状態（何かが動いている間）。 */
const SPINNING_STATES: ReadonlySet<CurrentWork["state"]> = new Set([
  "running",
  "diary",
  "background",
])

// 入力・出力を読める形の文字列にしてから切り詰める上限。表示を壊さないためであって秘匿のためではない。
const MAX_TOOL_TEXT_LENGTH = 8000

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
        {props.variant === "capsule" && SPINNING_STATES.has(work.state) ? (
          <SpinnerMark />
        ) : (
          <span className={styles["current-work-mark"]} aria-hidden="true">
            {work.mark}
          </span>
        )}
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
      {work.open && <CurrentWorkList id={listId} work={work} variant={props.variant} />}
    </div>
  )
}

/** 動いている間の印。輪の一部だけを差し色にして回す（`prefers-reduced-motion: reduce` では `theme.css` の全体の規則が止める）。 */
function SpinnerMark(): ReactElement {
  return (
    <svg
      className={styles["current-work-spinner"]}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className={styles["current-work-spinner-track"]} cx="12" cy="12" r="9" />
      <path className={styles["current-work-spinner-arc"]} d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  )
}

function CurrentWorkList(props: {
  readonly id: string
  readonly work: CurrentWork
  readonly variant: CurrentWorkVariant
}): ReactElement {
  const { work } = props
  const listRef = useRef<HTMLDivElement>(null)
  useCurrentWorkListMaxHeight(listRef, props.variant === "capsule")

  return (
    <div id={props.id} ref={listRef} className={styles["current-work-list"]} role="region">
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
          type="button"
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
            <code>{truncateForDisplay(work.runningStep.fullText)}</code>
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
              type="button"
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

/** 段で区切った手順のまとまり。段の小見出しがあれば手順の上に置く。 */
function CurrentWorkStepGroup(props: { readonly group: CurrentWorkStepGroup }): ReactElement {
  const { group } = props
  return (
    <>
      {group.heading.kind === "phase" && (
        <Text
          element="p"
          size="inherit"
          tone="inherit"
          weight="semibold"
          className={styles["current-work-phase-heading"]}
        >
          {group.heading.label}
        </Text>
      )}
      <ul className={styles["current-work-steps"]}>
        {group.steps.map((step) => (
          <CurrentWorkStepRow key={step.key} step={step} />
        ))}
      </ul>
    </>
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
    <li className={styles["current-work-background-task"]}>
      <span className={styles["current-work-step-mark"]} aria-hidden="true">
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

/** 手順1件。サブエージェントの中（nested）は1段下げる。失敗は `<details>` で開いて読める。 */
function CurrentWorkStepRow(props: { readonly step: CurrentWorkStep }): ReactElement {
  const { step } = props
  const classes = clsx(
    step.nested && styles["current-work-step-nested"],
    step.status.kind === "done" && styles["current-work-step-done"],
    step.status.kind === "running" && styles["current-work-step-running"],
    step.status.kind === "failed" && styles["current-work-step-failed"],
  )

  return (
    <li className={classes}>
      {step.status.kind === "failed" ? (
        <FailureDetail label={step.label} input={step.input} output={step.status.output} />
      ) : (
        <>
          <span className={styles["current-work-step-mark"]} aria-hidden="true">
            {step.status.kind === "running" ? "…" : "✓"}
          </span>{" "}
          {step.label}
        </>
      )}
    </li>
  )
}

/** 失敗した手順の中身（引数と出力）。「失敗」の文字を印にする（色だけで意味を伝えない）。 */
function FailureDetail(props: {
  readonly label: string
  readonly input: unknown
  readonly output: string
}): ReactElement {
  return (
    <details className={styles["current-work-failure"]}>
      <summary>
        <Text element="span" size="inherit" tone="state-ng" weight="semibold" className="">
          失敗
        </Text>{" "}
        {props.label}
      </summary>
      {/* 出力が先。開いてまず読みたいのは「何が起きたか」で、引数はその裏取りに使う。 */}
      <pre className={styles["current-work-failure-output"]}>
        <code>{truncateForDisplay(props.output)}</code>
      </pre>
      <pre className={styles["current-work-failure-input"]}>
        <code>{truncateForDisplay(stringifyToolInput(props.input))}</code>
      </pre>
    </details>
  )
}

/** ツールの入力（SDK のイベントから来た JSON 値）を、読める形の文字列にする。 */
function stringifyToolInput(input: unknown): string {
  if (input === undefined) {
    return ""
  }

  const json = JSON.stringify(input, null, 2)
  return json ?? String(input)
}

/** 表示を壊さない程度に文字列を切り詰める。上限を超えた分は捨てて、落とした文字数だけを添える。 */
function truncateForDisplay(text: string): string {
  if (text.length <= MAX_TOOL_TEXT_LENGTH) {
    return text
  }

  const omitted = text.length - MAX_TOOL_TEXT_LENGTH
  return `${text.slice(0, MAX_TOOL_TEXT_LENGTH)}\n…（以下 ${String(omitted)} 文字を省略）`
}
