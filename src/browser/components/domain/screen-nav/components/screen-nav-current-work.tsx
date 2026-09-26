// 帯のまん中の札「いまの作業」と、押すと開く依頼の手順の一覧（docs/screen-design.md 13.9
// 「いまの作業」）。ロジックは `hooks/use-current-work.ts`、ここは受け取った値をそのまま置く器
// （2章「機能の中を分ける」）。
//
// 同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く（`ScreenNavRoom` などと同じ
// 畳み方。どちらを出すかは CSS の `@media` が決める）。開閉の状態は1つの hook が持つので、
// どちらから押しても同じ一覧が開く——id は `useId()` でこの器ごとに振る（2箇所に描くため、
// `aria-controls` が指す一覧の id が重ならないようにする）。Esc の戻り先として札の DOM を
// 預ける口（`work.toggleRef`）も、2箇所ぶんを集めるコールバック ref（`use-current-work.ts`）。
//
// 失敗した手順の `<details>` は、もとサイドバーにあった `activity.tsx` の `FailureDetail` を
// そのまま移した（引数と出力を読める場所はここだけ。docs/screen-design.md 13.9）。

import clsx from "clsx"
import { useId, type ReactElement } from "react"

import { Button } from "../../../../components/ui/button/button.tsx"
import { Text } from "../../../../components/ui/text/text.tsx"
import {
  type ScreenNavCurrentWork,
  type ScreenNavCurrentWorkBackgroundTask,
  type ScreenNavCurrentWorkStep,
} from "../hooks/use-current-work.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-current-work.module.css"

export type ScreenNavCurrentWorkProps = {
  readonly work: ScreenNavCurrentWork
}

// 入力・出力を読める形の文字列にしてから切り詰める上限。表示を壊さないためであって秘匿の
// ためではない（元は `sidebar/activity.tsx`）。
const MAX_TOOL_TEXT_LENGTH = 8000

/** 答え待ちが質問のときに一覧へ出す口（docs/screen-design.md 13.9「いまの作業」）。 */
const GO_TO_QUESTION_LABEL = "質問へ"

export function ScreenNavCurrentWorkPill(props: ScreenNavCurrentWorkProps): ReactElement {
  const { work } = props
  // 預け先はここで分解して受ける（`work.toggleRef` の形のまま `ref` に渡すと、
  // `react(refs)`（規約「レンダー中に ref を読み書きしない」）が `work` への参照ごと
  // レンダー中の ref の読み書きとみなして落ちる。`presentational-screen-nav.tsx` と同じ事情）。
  const { toggleRef } = work
  const listId = useId()

  // `shellStyles` は見た目を持たない（広い画面から隠す規則
  // `.screen-nav > .screen-nav-work` と「≡」の面の中で縦に積む規則
  // `.screen-nav-panel .screen-nav-work*` のためだけの参照）。CSS Modules は class 名を
  // ファイルごとにハッシュ化するので、`screen-nav.module.css` 側の選択子を当てるにはこのファイル
  // 自身の class も要る（docs/design.md 6.6）。
  return (
    <div
      className={clsx(styles["screen-nav-work"], shellStyles["screen-nav-work"])}
      data-work-state={work.state}
      data-chat-idle={work.chatIdle}
    >
      <button
        type="button"
        ref={toggleRef}
        className={clsx(styles["screen-nav-work-toggle"], shellStyles["screen-nav-work-toggle"])}
        aria-expanded={work.open}
        aria-controls={listId}
        onClick={work.onToggle}
      >
        <span className={styles["screen-nav-work-mark"]} aria-hidden="true">
          {work.mark}
        </span>
        <span className={styles["screen-nav-work-word"]}>{work.wordLabel}</span>
        {work.summary.kind === "text" ? (
          <>
            <span className={styles["screen-nav-work-sep"]} aria-hidden="true" />
            <span className={styles["screen-nav-work-summary"]}>{work.summary.label}</span>
          </>
        ) : null}
      </button>
      {work.open ? <CurrentWorkList id={listId} work={work} /> : null}
    </div>
  )
}

function CurrentWorkList(props: {
  readonly id: string
  readonly work: ScreenNavCurrentWork
}): ReactElement {
  const { work } = props

  return (
    <div
      id={props.id}
      className={clsx(styles["screen-nav-work-list"], shellStyles["screen-nav-work-list"])}
      role="region"
    >
      <Text
        element="p"
        size="inherit"
        tone="inherit"
        weight="semibold"
        className={styles["screen-nav-work-heading"] ?? ""}
      >
        {work.wordLabel}
        {work.pendingHint.kind === "input" ? "。入力欄の上で答えられる" : ""}
      </Text>
      {work.pendingHint.kind === "question" ? (
        <Button
          type="button"
          variant="link"
          size="label"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["screen-nav-work-go-to-question"] ?? ""}
          onClick={work.pendingHint.onGoToQuestion}
        >
          {GO_TO_QUESTION_LABEL}
        </Button>
      ) : null}
      {work.runningStep.kind === "none" ? null : (
        <div className={styles["screen-nav-work-full"]}>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-work-full-heading"] ?? ""}
          >
            実行中の {work.runningStep.toolName}
          </Text>
          <pre className={styles["screen-nav-work-full-text"]}>
            <code>{truncateForDisplay(work.runningStep.fullText)}</code>
          </pre>
        </div>
      )}
      {work.backgroundList.kind === "tasks" ? (
        <>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-work-background-heading"] ?? ""}
          >
            {work.backgroundList.headingLabel}
          </Text>
          <ul className={styles["screen-nav-work-background"]}>
            {work.backgroundList.tasks.map((task) => (
              <CurrentWorkBackgroundRow key={task.key} task={task} />
            ))}
          </ul>
        </>
      ) : null}
      {work.stepList.kind === "steps" ? (
        <>
          <Text
            element="p"
            size="inherit"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-work-steps-heading"] ?? ""}
          >
            {work.stepList.headingLabel}
          </Text>
          <ul className={styles["screen-nav-work-steps"]}>
            {work.stepList.steps.map((step) => (
              <CurrentWorkStepRow key={step.key} step={step} />
            ))}
          </ul>
          {work.stepList.toggleAll.kind === "expandable" ? (
            <Button
              type="button"
              variant="link"
              size="label"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["screen-nav-work-toggle-all"] ?? ""}
              onClick={work.stepList.onToggleExpanded}
            >
              {work.stepList.toggleAll.label}
            </Button>
          ) : null}
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

/**
 * 背景のタスク1件（docs/screen-design.md 13.9「背景のタスク」）。印は実行中の手順と同じ回る
 * 「…」（動いているものの印を2種類にしない）。種類の語は手順のツール名と同じ等幅の列に置く。
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
      <span className={styles["screen-nav-work-background-kind"]}>{task.kindLabel}</span>
      {task.description === "" ? null : ` ${task.description}`}
    </li>
  )
}

/** 手順1件。サブエージェントの中（nested）は1段下げる。失敗は `<details>` で開いて読める。 */
function CurrentWorkStepRow(props: { readonly step: ScreenNavCurrentWorkStep }): ReactElement {
  const { step } = props
  const classes = clsx(
    styles["screen-nav-work-step"],
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

/**
 * 失敗した手順の中身（引数と出力）。「失敗」の文字を印にする（色だけで意味を伝えない。
 * docs/screen-design.md 13.1 原則5）。開くと出力、引数の順に出る（`sidebar/activity.tsx` から移した）。
 */
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

/** ツールの入力（`unknown`。SDK のイベントから来た JSON 値）を、読める形の文字列にする。 */
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
