import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import { WorkflowFieldDescription } from "./workflow-field-description.tsx"
import styles from "./workflow-field-head.module.css"
import sharedStyles from "./workflow-field.module.css"

export function WorkflowFieldHead(props: {
  readonly label: string
  readonly description: string
}): ReactElement {
  return (
    <div className={sharedStyles["field-head"]}>
      <Text
        element="p"
        size="subheading"
        tone="ink"
        weight="bold"
        className={styles["field-label"]}
      >
        {props.label}
      </Text>
      <WorkflowFieldDescription text={props.description} />
    </div>
  )
}
