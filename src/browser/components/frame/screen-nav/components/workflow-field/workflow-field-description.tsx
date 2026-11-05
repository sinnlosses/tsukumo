import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import styles from "./workflow-field-description.module.css"

export function WorkflowFieldDescription(props: { readonly text: string }): ReactElement {
  return (
    <Text
      element="p"
      size="label"
      tone="ink-quiet"
      weight="inherit"
      className={styles["field-description"]}
    >
      {props.text}
    </Text>
  )
}
