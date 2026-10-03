// タスク運用が無い（プロジェクトの設定が無い）ときに、仕事のサイドバーでタスクの節の代わりに置く短い表示。
// 区画の見出しと「一覧を見る」は持たない。

import type { ReactElement } from "react"

import { PROJECT_SETTINGS_PATH } from "../../../../../shared/repository/project-settings.ts"
import { Text } from "../../../ui/text/text.tsx"
import styles from "./project-settings-missing.module.css"

export function ProjectSettingsMissing(): ReactElement {
  return (
    <div className={styles["project-settings-missing"]}>
      <Text
        element="p"
        size="secondary"
        tone="ink-quiet"
        weight="normal"
        className={styles["project-settings-missing-text"]}
      >
        プロジェクトの設定が無い
      </Text>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="normal"
        className={styles["project-settings-missing-path"]}
      >
        {PROJECT_SETTINGS_PATH}
      </Text>
    </div>
  )
}
