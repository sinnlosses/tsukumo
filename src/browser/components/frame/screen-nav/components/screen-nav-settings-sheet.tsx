// 設定の紙（`#settings`）の中身。
// 群（`SETTINGS_GROUPS`）の見出しの下に、面の中身を1列で縦に並べ、末尾に「既定に戻す」を1つ置く。
import type { ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Heading } from "../../../ui/heading/heading.tsx"
import { FACES, SETTINGS_GROUPS, type Face } from "./screen-nav-settings-face.tsx"
import styles from "./screen-nav-settings-sheet.module.css"
import { ScreenNavSettingsWorkflowFlow } from "./screen-nav-settings-workflow.tsx"
import gearStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

export function ScreenNavSettingsSheet(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props

  return (
    <div className={styles["sheet"]}>
      {SETTINGS_GROUPS.map((group) => (
        <section key={group.label} className={styles["group"]} aria-label={group.label}>
          <Heading
            level={2}
            size="subheading"
            tone="ink"
            weight="bold"
            className={styles["group-title"]}
          >
            {group.label}
          </Heading>
          <div className={gearStyles["screen-nav-settings-table"]}>
            <div className={styles["group-body"]}>
              {group.keys
                .flatMap((key) => FACES.filter((face) => face.key === key))
                .map((face) => (
                  <FaceContent key={face.key} face={face} settings={settings} />
                ))}
            </div>
          </div>
        </section>
      ))}
      <div className={styles["reset-row"]}>
        <Button
          variant="outline"
          size="label"
          pressed="none"
          disabled={settings.resetDisabled}
          disclosure={{ kind: "none" }}
          className=""
          onClick={settings.onReset}
        >
          既定に戻す
        </Button>
      </div>
    </div>
  )
}

function FaceContent(props: {
  readonly face: Face
  readonly settings: ScreenNavSettingsProps["settings"]
}): ReactElement {
  const { face } = props
  if (face.foot === "own") {
    return <ScreenNavSettingsWorkflowFlow bandClassName={styles["workflow-band"]} />
  }
  return <face.Body settings={props.settings} />
}
