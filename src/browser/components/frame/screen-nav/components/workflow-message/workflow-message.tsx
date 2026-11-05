import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import styles from "./workflow-message.module.css"

export function WorkflowMessage(props: {
  readonly text: string
  readonly tone: "ink" | "ink-quiet" | "state-warn"
}): ReactElement {
  return (
    <Text
      element="p"
      size="secondary"
      tone={props.tone}
      weight="inherit"
      className={styles["message"]}
    >
      {props.text}
    </Text>
  )
}
