import type { ReactElement } from "react"

import type { ScreenNavWorkflowSettingStepsRow } from "../../hooks/use-workflow-setting.ts"
import styles from "../screen-nav-settings-workflow.module.css"
import { WorkflowFieldHead } from "../workflow-field/workflow-field-head.tsx"
import { WorkflowFieldNotice } from "../workflow-field/workflow-field-notice.tsx"
import { WorkflowFlow } from "./workflow-flow.tsx"
import { WorkflowParkedSkillList } from "./workflow-parked-skill-list.tsx"
import { WorkflowStepList } from "./workflow-step-list.tsx"

export function WorkflowStepsField(props: {
  readonly row: ScreenNavWorkflowSettingStepsRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  return (
    <div className={styles["field"]}>
      <WorkflowFieldHead label={row.label} description={row.description} />
      <WorkflowFlow steps={row.steps} />
      <WorkflowStepList row={row} busy={busy} />
      <WorkflowParkedSkillList row={row} busy={busy} />
      <WorkflowFieldNotice row={row} />
    </div>
  )
}
