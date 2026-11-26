// 設定の面の1行。名前と操作子を並べ、既定と違う項目には左端の線と、その項目だけ既定へ戻す ↺ を足す。
// パレットから「この行」を指して開かれたときは、マウント時に見える位置へ送り、動きを減らす設定でなければ一瞬光らせる。

import { RotateCcw } from "lucide-react"
import { useRef, type ReactElement, type ReactNode } from "react"

import { SETTING_ENTRIES } from "../../../../domain/setting-entry.ts"
import { useMountEffect } from "../../../../hooks/use-mount-effect.ts"
import { useSettingsRequest } from "../../../../stores/settings-request.ts"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import type { ScreenNavSettingsItem, SettingItemKey } from "../hooks/use-settings.ts"
import styles from "./screen-nav-settings.module.css"

const FOUND_MILLISECONDS = 1200

export function ScreenNavSettingsRow(props: {
  readonly itemKey: SettingItemKey
  readonly item: ScreenNavSettingsItem
  /** 名前の字。下に宣言の説明が付く。 */
  readonly name: ReactNode
  /** 操作子。 */
  readonly children: ReactNode
}): ReactElement {
  const { item, itemKey } = props
  const description = SETTING_ENTRIES.find((entry) => entry.itemKey === itemKey)?.description
  const rowRef = useRef<HTMLElement>(null)

  useMountEffect(() => {
    const row = rowRef.current
    const { itemKey: target, clearItem } = useSettingsRequest.getState()
    if (row === null || target !== itemKey) {
      return
    }
    clearItem()
    row.scrollIntoView({ block: "center" })
    if (document.documentElement.dataset["motion"] === "reduce") {
      return
    }
    row.dataset["found"] = "true"
    const timer = window.setTimeout(() => {
      delete row.dataset["found"]
    }, FOUND_MILLISECONDS)
    return () => {
      window.clearTimeout(timer)
    }
  })

  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      ref={rowRef}
      gap="lg"
      align="center"
      justify="between"
      wrap="nowrap"
      className={styles["screen-nav-settings-row"]}
    >
      <div className={styles["screen-nav-settings-name"]}>
        {props.name}
        {description !== undefined && (
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-description"]}
          >
            {description}
          </Text>
        )}
      </div>
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
