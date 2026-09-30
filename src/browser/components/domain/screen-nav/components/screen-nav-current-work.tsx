// 帯のまん中の札「いまの作業」と、押すと開く依頼の手順の一覧。
//
// 同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く（どちらを出すかは CSS の `@media` が決める）。
// 開閉の状態は1つの hook が持つので、どちらから押しても同じ一覧が開く。
// id は `useId()` でこの器ごとに振る（`aria-controls` が指す一覧の id が重ならないようにする）。
// Esc の戻り先として札の DOM を預ける口（`work.toggleRef`）も、2箇所ぶんを集めるコールバック ref。
//
// 失敗した手順の引数と出力を読める場所はここだけ。

import clsx from "clsx"
import { useId, useRef, type ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { useCurrentWorkListMaxHeight } from "../hooks/use-current-work-list-max-height.ts"
import type {
  ScreenNavCurrentWork,
  ScreenNavCurrentWorkBackgroundTask,
  ScreenNavCurrentWorkPlanPhase,
  ScreenNavCurrentWorkStep,
  ScreenNavCurrentWorkStepGroup,
} from "../hooks/use-current-work.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-current-work.module.css"

/**
 * 札の置き場所。
 * `band` は帯のまん中（と「≡」の面の中）、`capsule` は会話の画面のメインビューの下に浮かぶ札（`CurrentWorkCapsule`）。
 * `capsule` は一覧を札の上へ開き、動いている間は印を回る輪にする。
 */
export type ScreenNavCurrentWorkVariant = "band" | "capsule"

export type ScreenNavCurrentWorkProps = {
  readonly work: ScreenNavCurrentWork
  readonly variant: ScreenNavCurrentWorkVariant
}

/** 回る輪を印にする状態（何かが動いている間）。 */
const SPINNING_STATES: ReadonlySet<ScreenNavCurrentWork["state"]> = new Set([
  "running",
  "diary",
  "background",
])

// 入力・出力を読める形の文字列にしてから切り詰める上限。表示を壊さないためであって秘匿のためではない。
const MAX_TOOL_TEXT_LENGTH = 8000

/** 答え待ちが質問のときに一覧へ出す口。 */
const GO_TO_QUESTION_LABEL = "質問へ"

export function ScreenNavCurrentWorkPill(props: ScreenNavCurrentWorkProps): ReactElement {
  const { work } = props
  // 預け先はここで分解して受ける。
  // `work.toggleRef` の形のまま `ref` に渡すと、`react(refs)` が `work` への参照ごとレンダー中の ref の読み書きとみなして落ちる。
  const { toggleRef } = work
  const listId = useId()

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div
      className={clsx(styles["screen-nav-work"], shellStyles["screen-nav-work"])}
      data-work-state={work.state}
      data-chat-idle={work.chatIdle}
      data-variant={props.variant}
    >
      <button
        type="button"
        ref={toggleRef}
        className={clsx(styles["screen-nav-work-toggle"], shellStyles["screen-nav-work-toggle"])}
        aria-expanded={work.open}
        aria-controls={listId}
        onClick={work.onToggle}
      >
        {props.variant === "capsule" && SPINNING_STATES.has(work.state) ? (
          <SpinnerMark />
        ) : (
          <span className={styles["screen-nav-work-mark"]} aria-hidden="true">
            {work.mark}
          </span>
        )}
        <span className={styles["screen-nav-work-word"]}>{work.wordLabel}</span>
        {work.phase.kind === "shown" && (
          <>
            <span className={styles["screen-nav-work-sep"]} aria-hidden="true" />
            <Text
              element="span"
              size="inherit"
              tone="ink"
              weight="inherit"
              className={styles["screen-nav-work-phase"]}
            >
              {work.phase.label}
            </Text>
          </>
        )}
        {work.summary.kind === "text" && (
          <>
            <span className={styles["screen-nav-work-sep"]} aria-hidden="true" />
            <Text
              element="span"
              size="inherit"
              tone="inherit"
              weight="inherit"
              className={styles["screen-nav-work-summary"]}
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
      className={styles["screen-nav-work-spinner"]}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className={styles["screen-nav-work-spinner-track"]} cx="12" cy="12" r="9" />
      <path className={styles["screen-nav-work-spinner-arc"]} d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  )
}

function CurrentWorkList(props: {
  readonly id: string
  readonly work: ScreenNavCurrentWork
  readonly variant: ScreenNavCurrentWorkVariant
}): ReactElement {
  const { work } = props
  const listRef = useRef<HTMLDivElement>(null)
  useCurrentWorkListMaxHeight(listRef, props.variant === "capsule")

  return (
    <div
      id={props.id}
      ref={listRef}
      className={clsx(styles["screen-nav-work-list"], shellStyles["screen-nav-work-list"])}
      role="region"
    >
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="semibold"
        className={styles["screen-nav-work-heading"]}
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
          className={styles["screen-nav-work-go-to-question"]}
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
            className={styles["screen-nav-work-plan-heading"]}
          >
            {work.plan.headingLabel}
          </Text>
          <ol className={styles["screen-nav-work-plan"]}>
            {work.plan.phases.map((phase) => (
              <CurrentWorkPlanPhase key={phase.key} phase={phase} />
            ))}
          </ol>
        </>
      )}
      {work.runningStep.kind !== "none" && (
        <div className={styles["screen-nav-work-full"]}>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-work-full-heading"]}
          >
            実行中の {work.runningStep.toolName}
          </Text>
          <pre className={styles["screen-nav-work-full-text"]}>
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
            className={styles["screen-nav-work-background-heading"]}
          >
            {work.backgroundList.headingLabel}
          </Text>
          <ul className={styles["screen-nav-work-background"]}>
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
            className={styles["screen-nav-work-steps-heading"]}
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
              className={styles["screen-nav-work-toggle-all"]}
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
function CurrentWorkPlanPhase(props: {
  readonly phase: ScreenNavCurrentWorkPlanPhase
}): ReactElement {
  const { phase } = props
  return (
    <li
      className={clsx(
        styles["screen-nav-work-plan-phase"],
        phase.state === "done" && styles["screen-nav-work-plan-phase-done"],
        phase.state === "current" && styles["screen-nav-work-plan-phase-current"],
      )}
    >
      <b>{phase.mark}</b>
      {phase.name}
    </li>
  )
}

/** 段で区切った手順のまとまり。段の小見出しがあれば手順の上に置く。 */
function CurrentWorkStepGroup(props: {
  readonly group: ScreenNavCurrentWorkStepGroup
}): ReactElement {
  const { group } = props
  return (
    <>
      {group.heading.kind === "phase" && (
        <Text
          element="p"
          size="inherit"
          tone="inherit"
          weight="semibold"
          className={styles["screen-nav-work-phase-heading"]}
        >
          {group.heading.label}
        </Text>
      )}
      <ul className={styles["screen-nav-work-steps"]}>
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
  readonly task: ScreenNavCurrentWorkBackgroundTask
}): ReactElement {
  const { task } = props
  return (
    <li className={styles["screen-nav-work-background-task"]}>
      <span className={styles["screen-nav-work-step-mark"]} aria-hidden="true">
        …
      </span>{" "}
      <Text
        element="span"
        size="inherit"
        tone="inherit"
        weight="inherit"
        className={styles["screen-nav-work-background-kind"]}
      >
        {task.kindLabel}
      </Text>
      {task.description !== "" && ` ${task.description}`}
    </li>
  )
}

/** 手順1件。サブエージェントの中（nested）は1段下げる。失敗は `<details>` で開いて読める。 */
function CurrentWorkStepRow(props: { readonly step: ScreenNavCurrentWorkStep }): ReactElement {
  const { step } = props
  const classes = clsx(
    step.nested && styles["screen-nav-work-step-nested"],
    step.status.kind === "done" && styles["screen-nav-work-step-done"],
    step.status.kind === "running" && styles["screen-nav-work-step-running"],
    step.status.kind === "failed" && styles["screen-nav-work-step-failed"],
  )

  return (
    <li className={classes}>
      {step.status.kind === "failed" ? (
        <FailureDetail label={step.label} input={step.input} output={step.status.output} />
      ) : (
        <>
          <span className={styles["screen-nav-work-step-mark"]} aria-hidden="true">
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
    <details className={styles["screen-nav-work-failure"]}>
      <summary>
        <Text element="span" size="inherit" tone="state-ng" weight="semibold" className="">
          失敗
        </Text>{" "}
        {props.label}
      </summary>
      {/* 出力が先。開いてまず読みたいのは「何が起きたか」で、引数はその裏取りに使う。 */}
      <pre className={styles["screen-nav-work-failure-output"]}>
        <code>{truncateForDisplay(props.output)}</code>
      </pre>
      <pre className={styles["screen-nav-work-failure-input"]}>
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
