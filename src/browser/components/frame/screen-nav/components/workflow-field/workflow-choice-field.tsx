import clsx from "clsx"
import type { ReactElement } from "react"

import type { ScreenNavWorkflowSettingChoiceRow } from "../../hooks/use-workflow-setting.ts"
import fieldStyles from "../screen-nav-settings-workflow.module.css"
import styles from "./workflow-choice-field.module.css"
import { WorkflowFieldHead } from "./workflow-field-head.tsx"
import { WorkflowFieldNotice } from "./workflow-field-notice.tsx"

export function WorkflowChoiceField(props: {
  readonly row: ScreenNavWorkflowSettingChoiceRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  return (
    <div className={fieldStyles["field"]}>
      <WorkflowFieldHead label={row.label} description={row.description} />
      <div role="radiogroup" aria-label={row.label} className={styles["options"]}>
        {row.options.map((option) => (
          <label
            key={option.value}
            className={clsx(styles["option"], option.selected && styles["option-selected"])}
          >
            <input
              type="radio"
              name={row.key}
              value={option.value}
              checked={option.selected}
              disabled={busy}
              className={styles["option-radio"]}
              onChange={() => {
                row.onSelect(option.value)
              }}
            />
            <span className={styles["option-body"]}>
              <span className={styles["option-label"]}>{option.label}</span>
              <span className={styles["option-description"]}>{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      <WorkflowFieldNotice row={row} />
    </div>
  )
}
