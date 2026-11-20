// 設定の面の1行。名前と操作子を並べ、既定と違う項目には左端の線と、その項目だけ既定へ戻す ↺ を足す。

import { RotateCcw } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import type { ScreenNavSettingsItem } from "../hooks/use-settings.ts"
import styles from "./screen-nav-settings.module.css"

export function ScreenNavSettingsRow(props: {
  readonly item: ScreenNavSettingsItem
  readonly children: ReactNode
}): ReactElement {
  const { item } = props

  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      gap="lg"
      align="center"
      justify="between"
      wrap="nowrap"
      className={styles["screen-nav-settings-row"]}
    >
      {props.children}
      {item.changed && (
        <button
          type="button"
          className={styles["screen-nav-settings-item-reset"]}
          aria-label={item.resetTitle}
          title={item.resetTitle}
          onClick={item.onReset}
        >
          <RotateCcw size={14} strokeWidth={1.8} />
        </button>
      )}
      {item.changed && (
        <span className={styles["screen-nav-settings-row-mark"]} aria-hidden="true" />
      )}
    </HStack>
  )
}
