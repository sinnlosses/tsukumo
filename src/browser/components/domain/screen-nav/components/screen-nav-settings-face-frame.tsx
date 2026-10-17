// 設定のダイアログの面の枠。スクロールする中に面の名前と中身の表を置き、下の帯（`foot`）を面の下端に置く。
// 下の帯を持たない面は `foot` に `undefined` を渡す。

import type { ReactElement, ReactNode } from "react"

import { Text } from "../../../ui/text/text.tsx"
import styles from "./screen-nav-settings-face-frame.module.css"
import gearStyles from "./screen-nav-settings.module.css"

export function ScreenNavSettingsFaceFrame(props: {
  readonly title: string
  readonly children: ReactNode
  readonly foot: ReactNode | undefined
}): ReactElement {
  return (
    <>
      <div className={styles["face-scroll"]}>
        <Text element="p" size="heading" tone="ink" weight="bold" className={styles["face-title"]}>
          {props.title}
        </Text>
        <div className={gearStyles["screen-nav-settings-table"]}>{props.children}</div>
      </div>
      {props.foot !== undefined && <footer className={styles["foot"]}>{props.foot}</footer>}
    </>
  )
}
