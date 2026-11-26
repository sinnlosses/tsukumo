import type { ReactElement } from "react"

import { RadioList } from "../../../../ui/radio-list/radio-list.tsx"
import type { ScreenNavWorkflowSettingChoiceRow } from "../../hooks/use-workflow-setting.ts"
import fieldStyles from "../screen-nav-settings-workflow.module.css"
import { WorkflowFieldHead } from "./workflow-field-head.tsx"
import { WorkflowFieldNotice } from "./workflow-field-notice.tsx"

export function WorkflowChoiceField(props: {
  readonly row: ScreenNavWorkflowSettingChoiceRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  const selected = row.options.find((option) => option.selected)
  return (
    <div className={fieldStyles["field"]}>
      <WorkflowFieldHead label={row.label} description={row.description} />
      <RadioList
        label={row.label}
        value={selected?.value ?? ""}
        items={row.options.map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
        }))}
        disabled={busy}
        onChange={row.onSelect}
      />
      <WorkflowFieldNotice row={row} />
    </div>
  )
}
