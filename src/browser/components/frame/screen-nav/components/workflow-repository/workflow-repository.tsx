import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import type { ScreenNavWorkflowSettingRepository } from "../../hooks/use-workflow-setting.ts"
import styles from "./workflow-repository.module.css"

export function WorkflowRepository(props: {
  readonly repository: ScreenNavWorkflowSettingRepository
}): ReactElement {
  return (
    <div className={styles["repository"]}>
      <Text
        element="p"
        size="secondary"
        tone="ink"
        weight="bold"
        className={styles["repository-name"]}
      >
        {props.repository.name} のリポジトリ
      </Text>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["repository-path"]}
      >
        {props.repository.path}
      </Text>
    </div>
  )
}
