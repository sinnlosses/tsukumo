import type { ReactElement } from "react"

import type { ScreenNavWorkflowSettingReadonlyRow } from "../../hooks/use-workflow-setting.ts"
import styles from "../screen-nav-settings-workflow.module.css"
import { WorkflowFieldHead } from "./workflow-field-head.tsx"

export function WorkflowReadonlyField(props: {
  readonly row: ScreenNavWorkflowSettingReadonlyRow
}): ReactElement {
  const { row } = props
  return (
    <div className={styles["field"]}>
      <WorkflowFieldHead label={row.label} description={row.description} />
      <p className={styles["step-id"]}>{row.current}</p>
    </div>
  )
}
