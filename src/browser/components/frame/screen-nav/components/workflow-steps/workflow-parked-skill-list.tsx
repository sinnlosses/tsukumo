import { Plus } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { ScreenNavWorkflowSettingStepsRow } from "../../hooks/use-workflow-setting.ts"
import sharedStyles from "../screen-nav-settings-workflow.module.css"
import styles from "./workflow-parked-skill-list.module.css"

export function WorkflowParkedSkillList(props: {
  readonly row: ScreenNavWorkflowSettingStepsRow
  readonly busy: boolean
}): ReactElement {
  const { row, busy } = props
  return (
    <>
      {row.addable.length > 0 && (
        <div className={styles["parked"]}>
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["parked-head"]}
          >
            並びに入っていないスキル<span className={styles["parked-hint"]}>押すと最後に足す</span>
          </Text>
          <div className={styles["parked-chips"]}>
            {row.addable.map((option) => (
              <Button
                key={option.value}
                variant="outline-dashed"
                size="secondary"
                pressed="none"
                disabled={busy}
                ariaLabel={`${option.title} を並びの最後に足す`}
                disclosure={{ kind: "none" }}
                className={styles["parked-chip"]}
                onClick={() => {
                  row.onAdd(option.value)
                }}
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                <span className={styles["parked-chip-title"]}>{option.title}</span>
                <span className={sharedStyles["step-id"]}>{option.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
      {row.addable.length === 0 && (
        <p className={styles["parked-empty"]}>
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          足せるスキルはない（{row.steps.filter((step) => step.known).length}
          つとも並んでいる）
        </p>
      )}
    </>
  )
}
