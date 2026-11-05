import type { ReactElement } from "react"

import { TextField } from "../../../../ui/text-field/text-field.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { ScreenNavWorkflowSettingCommandRow } from "../../hooks/use-workflow-setting.ts"
import fieldStyles from "../screen-nav-settings-workflow.module.css"
import styles from "./workflow-command-field.module.css"
import { WorkflowFieldDescription } from "./workflow-field-description.tsx"
import { WorkflowFieldNotice } from "./workflow-field-notice.tsx"
import sharedStyles from "./workflow-field.module.css"

export function WorkflowCommandField(props: {
  readonly row: ScreenNavWorkflowSettingCommandRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  const inputId = `workflow-setting-${row.key}`
  return (
    <div className={fieldStyles["field"]}>
      <div className={sharedStyles["field-head"]}>
        <label htmlFor={inputId} className={styles["command-label"]}>
          {row.label}
        </label>
        <WorkflowFieldDescription text={row.description} />
      </div>
      <TextField
        element="input"
        id={inputId}
        className={styles["command-input"]}
        value={row.text}
        disabled={busy}
        onChange={row.onChange}
      />
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["command-hint"]}
      >
        無効にしたいときは「なし」と書く。空にして保存はできない。
      </Text>
      <WorkflowFieldNotice row={row} />
    </div>
  )
}
