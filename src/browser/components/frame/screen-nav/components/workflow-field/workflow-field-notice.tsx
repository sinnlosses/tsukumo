import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import type { ScreenNavWorkflowSettingStepsRow } from "../../hooks/use-workflow-setting.ts"
import styles from "./workflow-field-notice.module.css"

export function WorkflowFieldNotice(props: {
  readonly row: Pick<ScreenNavWorkflowSettingStepsRow, "notice">
}): ReactElement | undefined {
  const { notice } = props.row
  if (notice.kind === "none") {
    return undefined
  }
  return (
    <Text element="p" size="label" tone="state-warn" weight="inherit" className={styles["notice"]}>
      {notice.text}
    </Text>
  )
}
