import type { ReactElement } from "react"

import type { TokenUsageDays } from "../../../../../../shared/token-usage/token-usage-summary.ts"
import type { PeriodChoiceView } from "../../hooks/use-token-usage.ts"
import styles from "../../token-usage.module.css"

type PeriodChoicesProps = {
  readonly choices: readonly PeriodChoiceView[]
  readonly onDaysChange: (days: TokenUsageDays) => void
}

/** 期間の切り替え（「期間の消費」の見出しの右端）。 */
export function PeriodChoices(props: PeriodChoicesProps): ReactElement {
  return (
    <div className={styles["token-usage-period"]}>
      {props.choices.map((choice) => (
        <button
          key={choice.days}
          type="button"
          className={styles["token-usage-choice"]}
          aria-pressed={choice.pressed}
          onClick={() => {
            props.onDaysChange(choice.days)
          }}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}
