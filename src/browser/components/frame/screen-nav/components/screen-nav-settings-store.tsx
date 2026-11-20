// 設定の面の名前の下に出す、値の範囲の札（あなた・このリポジトリ）と保存先の1行。

import clsx from "clsx"
import type { ReactElement } from "react"

import { Text } from "../../../ui/text/text.tsx"
import styles from "./screen-nav-settings-store.module.css"

export type ScreenNavSettingsStoreProps = {
  readonly group: "you" | "repository"
  readonly store: string
}

const SCOPE_LABEL = { you: "あなた", repository: "このリポジトリ" } as const satisfies Record<
  ScreenNavSettingsStoreProps["group"],
  string
>

export function ScreenNavSettingsStore(props: ScreenNavSettingsStoreProps): ReactElement {
  const { group, store } = props
  return (
    <Text element="p" size="label" tone="ink-quiet" weight="inherit" className={styles["store"]}>
      <span className={clsx(styles["scope"], group === "repository" && styles["scope-repository"])}>
        {SCOPE_LABEL[group]}
      </span>
      <span>
        保存先 <code className={styles["path"]}>{store}</code>
      </span>
    </Text>
  )
}
