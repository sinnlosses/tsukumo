// 狭い画面の「いまの段 · n 題」と、いま走っている手順の1行(再試行中・答え待ちもここ)。広い画面では CSS で消える(進み具合の帯が持つ)。

import clsx from "clsx"
import type { ReactElement } from "react"

import styles from "./current-step.module.css"
import type { CurrentStepModel } from "./hooks/use-current-step.ts"

export function PresentationalCurrentStep(props: {
  readonly step: CurrentStepModel
}): ReactElement | null {
  const { step } = props
  if (step.kind === "none") {
    return null
  }
  const { activity } = step

  return (
    <section className={styles["current-step"]} aria-label="いまの段">
      <h4 className={styles["current-step-heading"]}>{step.heading}</h4>
      <p
        className={clsx(
          styles["current-step-activity"],
          activity.mono && styles["is-mono"],
          activity.tone === "asking" && styles["is-asking"],
        )}
      >
        <span className={styles["current-step-text"]}>{activity.text}</span>
        {activity.retry.kind === "retrying" && (
          <span className={styles["current-step-retry"]} title={activity.retry.detail}>
            {activity.retry.label}
          </span>
        )}
      </p>
    </section>
  )
}
