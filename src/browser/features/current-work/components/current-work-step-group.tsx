// 段で区切った依頼の手順のまとまり1つ。
//
// 失敗した手順の引数と出力を読める場所はここだけ。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import type {
  CurrentWorkStep,
  CurrentWorkStepGroup as CurrentWorkStepGroupView,
} from "../domain/current-work-step.ts"
import styles from "./current-work-step-group.module.css"

/** 段で区切った手順のまとまり。段の小見出しがあれば手順の上に置く。 */
export function CurrentWorkStepGroup(props: {
  readonly group: CurrentWorkStepGroupView
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
      {step.failure.kind === "failed" ? (
        <FailureDetail
          label={step.label}
          inputText={step.failure.inputText}
          outputText={step.failure.outputText}
        />
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
  readonly inputText: string
  readonly outputText: string
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
        <code>{props.outputText}</code>
      </pre>
      <pre className={styles["current-work-failure-input"]}>
        <code>{props.inputText}</code>
      </pre>
    </details>
  )
}
