import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { ScreenNavWorkflowSettingDraftChange } from "../../hooks/use-workflow-setting.ts"
import styles from "./workflow-save-band.module.css"

export function WorkflowSaveBand(props: {
  readonly change: ScreenNavWorkflowSettingDraftChange
  readonly busy: boolean
  readonly canSave: boolean
  readonly onSave: () => void
  readonly onCancel: () => void
}): ReactElement {
  const unchanged = props.change.kind === "none"
  return (
    <>
      {props.change.kind === "changed" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={styles["change"]}
        >
          <span aria-hidden="true">● </span>
          {props.change.text}
        </Text>
      )}
      <Button
        variant="outline"
        size="label"
        pressed="none"
        disabled={unchanged || props.busy}
        disclosure={{ kind: "none" }}
        className={styles["save-band-button"]}
        onClick={props.onCancel}
      >
        やめる
      </Button>
      <Button
        variant="solid-ink"
        size="label"
        pressed="none"
        disabled={unchanged || props.busy || !props.canSave}
        disclosure={{ kind: "none" }}
        className={styles["save-band-button"]}
        onClick={props.onSave}
      >
        保存
      </Button>
    </>
  )
}
