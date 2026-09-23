// 帯のまん中の札「いまの作業」と、押すと開く**依頼の手順**の一覧（docs/design.md 13.9
// 「いまの作業」）。ロジックは `hooks/use-current-work.ts`、ここは受け取った値をそのまま置く器
// （2章「機能の中を分ける」）。
//
// **同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く**（`ScreenNavRoom` などと同じ
// 畳み方。どちらを出すかは CSS の `@media` が決める）。開閉の状態は1つの hook が持つので、
// どちらから押しても同じ一覧が開く——**id は `useId()` でこの器ごとに振る**（2箇所に描くため、
// `aria-controls` が指す一覧の id が重ならないようにする）。
//
// **失敗した手順の `<details>` は、もとサイドバーにあった `activity.tsx` の `FailureDetail` を
// そのまま移した**（引数と出力を読める場所はここだけ。docs/design.md 13.9）。

import { useId, type ReactElement, type RefObject } from "react"

import {
  type ScreenNavCurrentWork,
  type ScreenNavCurrentWorkStep,
} from "../hooks/use-current-work.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavCurrentWorkProps = {
  readonly work: ScreenNavCurrentWork
  /** この器の札の DOM（Esc で閉じたときにフォーカスを戻す先。`use-current-work.ts` が持つ）。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}

// 入力・出力を読める形の文字列にしてから切り詰める上限。表示を壊さないためであって秘匿の
// ためではない（元は `sidebar/activity.tsx`。docs/requirements.md「切り詰めは表示のためであって
// 秘匿のためではない」）。
const MAX_TOOL_TEXT_LENGTH = 8000

export function ScreenNavCurrentWorkPill(props: ScreenNavCurrentWorkProps): ReactElement {
  const { work, toggleRef } = props
  const listId = useId()

  return (
    <div
      className={styles["screen-nav-work"]}
      data-work-state={work.state}
      data-chat-idle={work.chatIdle}
    >
      <button
        type="button"
        ref={toggleRef}
        className={styles["screen-nav-work-toggle"]}
        aria-expanded={work.open}
        aria-controls={listId}
        onClick={work.onToggle}
      >
        <span className={styles["screen-nav-work-mark"]} aria-hidden="true">
          {work.mark}
        </span>
        <span className={styles["screen-nav-work-word"]}>{work.wordLabel}</span>
        {work.runningStep.kind === "shown" ? (
          <>
            <span className={styles["screen-nav-work-sep"]} aria-hidden="true">
              |
            </span>
            <span className={styles["screen-nav-work-summary"]}>
              {work.runningStep.summaryLabel}
            </span>
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
    <div id={props.id} className={styles["screen-nav-work-list"]} role="region">
      <p className={styles["screen-nav-work-heading"]}>
        {work.wordLabel}
        {work.pendingHint ? "。入力欄の上で答えられる" : ""}
      </p>
      {work.runningStep.kind === "none" ? null : (
        <div className={styles["screen-nav-work-full"]}>
          <p className={styles["screen-nav-work-full-heading"]}>
            実行中の {work.runningStep.toolName}
          </p>
          <pre className={styles["screen-nav-work-full-text"]}>
            <code>{truncateForDisplay(work.runningStep.fullText)}</code>
          </pre>
        </div>
      )}
      {work.stepList.kind === "steps" ? (
        <>
          <p className={styles["screen-nav-work-steps-heading"]}>{work.stepList.headingLabel}</p>
          <ul className={styles["screen-nav-work-steps"]}>
            {work.stepList.steps.map((step) => (
              <CurrentWorkStepRow key={step.key} step={step} />
            ))}
          </ul>
          {work.stepList.toggleAll.kind === "expandable" ? (
            <button
              type="button"
              className={styles["screen-nav-work-toggle-all"]}
              onClick={work.stepList.onToggleExpanded}
            >
              {work.stepList.toggleAll.label}
            </button>
          ) : null}
        </>
      ) : (
        <p className={styles["screen-nav-work-empty"]}>
          {work.stepList.kind === "no-request"
            ? "まだ依頼が無い"
            : "この依頼ではまだツールを使っていない"}
        </p>
      )}
    </div>
  )
}

/** 手順1件。**サブエージェントの中（nested）は1段下げる。失敗は `<details>` で開いて読める。** */
function CurrentWorkStepRow(props: { readonly step: ScreenNavCurrentWorkStep }): ReactElement {
  const { step } = props
  const classes = [
    styles["screen-nav-work-step"],
    step.nested ? styles["screen-nav-work-step-nested"] : "",
    step.status.kind === "done" ? styles["screen-nav-work-step-done"] : "",
    step.status.kind === "running" ? styles["screen-nav-work-step-running"] : "",
    step.status.kind === "failed" ? styles["screen-nav-work-step-failed"] : "",
  ]
    .filter((name) => name !== "")
    .join(" ")

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
 * 失敗した手順の中身（引数と出力）。**「失敗」の文字を印にする**（色だけで意味を伝えない。
 * docs/design.md 13.1 原則5）。開くと出力、引数の順に出る（`sidebar/activity.tsx` から移した）。
 */
function FailureDetail(props: {
  readonly label: string
  readonly input: unknown
  readonly output: string
}): ReactElement {
  return (
    <details className={styles["screen-nav-work-failure"]}>
      <summary>
        <span className={styles["screen-nav-work-failure-mark"]}>失敗</span> {props.label}
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
