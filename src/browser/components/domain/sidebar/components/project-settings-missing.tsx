// タスク運用が無い（プロジェクトの設定が無い）ときに、仕事のサイドバーでタスクの節の代わりに置く表示。
// 見出し「タスク」と、プロジェクトの設定のダイアログを開く「⚙ 設定する」を点線の枠に入れて置く。
// 「一覧を見る」と見出しの歯車は持たない。

import type { ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { SettingsIcon } from "../../../ui/icon/icon.tsx"
import styles from "./project-settings-missing.module.css"

export type ProjectSettingsMissingProps = {
  readonly onOpenSettings: () => void
}

export function ProjectSettingsMissing(props: ProjectSettingsMissingProps): ReactElement {
  return (
    <div className={styles["project-settings-missing"]}>
      <Heading
        level={2}
        size="subheading"
        tone="ink"
        weight="bold"
        className={styles["project-settings-missing-heading"]}
      >
        タスク
      </Heading>
      <div className={styles["project-settings-missing-frame"]}>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup="dialog"
          disclosure={{ kind: "none" }}
          title={undefined}
          className={styles["project-settings-missing-button"]}
          onClick={props.onOpenSettings}
        >
          <SettingsIcon />
          設定する
        </Button>
      </div>
    </div>
  )
}
