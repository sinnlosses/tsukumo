import type { ReactElement } from "react"

import type { ScreenNavWorkflowSettingRow } from "../../hooks/use-workflow-setting.ts"
import { WorkflowStepsField } from "../workflow-steps/workflow-steps-field.tsx"
import { WorkflowChoiceField } from "./workflow-choice-field.tsx"
import { WorkflowCommandField } from "./workflow-command-field.tsx"
import { WorkflowReadonlyField } from "./workflow-readonly-field.tsx"

export function WorkflowField(props: {
  readonly row: ScreenNavWorkflowSettingRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  switch (row.kind) {
    case "steps":
      return <WorkflowStepsField row={row} busy={busy} />
    case "choice":
      return <WorkflowChoiceField row={row} busy={busy} />
    case "command":
      return <WorkflowCommandField row={row} busy={busy} />
    case "readonly":
      return <WorkflowReadonlyField row={row} />
  }
}
