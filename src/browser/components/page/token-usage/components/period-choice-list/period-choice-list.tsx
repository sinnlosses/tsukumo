import type { ReactElement } from "react"

import type { TokenUsageDays } from "../../../../../../shared/usage/token-usage-summary.ts"
import { SegmentedControl } from "../../../../ui/segmented-control/segmented-control.tsx"
import type { PeriodChoiceView } from "../../hooks/use-token-usage.ts"

type PeriodChoicesProps = {
  readonly choices: readonly PeriodChoiceView[]
  readonly onDaysChange: (days: TokenUsageDays) => void
}

/** 期間の切り替え（「期間の消費」の見出しの右端）。 */
export function PeriodChoices(props: PeriodChoicesProps): ReactElement {
  const pressed = props.choices.find((choice) => choice.pressed)
  return (
    <SegmentedControl
      label="期間"
      value={pressed === undefined ? "" : String(pressed.days)}
      items={props.choices.map((choice) => ({ value: String(choice.days), label: choice.label }))}
      onChange={(value) => {
        const choice = props.choices.find((candidate) => String(candidate.days) === value)
        if (choice !== undefined) props.onDaysChange(choice.days)
      }}
    />
  )
}
