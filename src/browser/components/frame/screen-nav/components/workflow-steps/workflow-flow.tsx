import { Fragment, type ReactElement } from "react"

import type { ScreenNavWorkflowSettingStep } from "../../hooks/use-workflow-setting.ts"
import styles from "./workflow-flow.module.css"

/** 行と同じ中身を順の1本で見せる。読み上げは行の並びが持つ。 */
export function WorkflowFlow(props: {
  readonly steps: readonly ScreenNavWorkflowSettingStep[]
}): ReactElement {
  return (
    <div className={styles["flow"]} aria-hidden="true">
      {props.steps.map((step, index) => (
        <Fragment key={step.value}>
          {index > 0 && <span className={styles["flow-arrow"]}>→</span>}
          <span className={styles["flow-chip"]}>
            <span className={styles["flow-number"]}>{index + 1}</span>
            {step.title}
          </span>
        </Fragment>
      ))}
    </div>
  )
}
