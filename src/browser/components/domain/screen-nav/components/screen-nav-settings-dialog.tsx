// 設定のダイアログの中身。頭（歯車の線画・「設定」・×）、左のナビ、右の面を組む。
// 選んでいる面はこの部品の `useState` が持つ。ダイアログを閉じると部品ごと消えるので、開くたび先頭の面から始まる。

import clsx from "clsx"
import { Settings, X } from "lucide-react"
import { useState, type ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { Text } from "../../../ui/text/text.tsx"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-settings-dialog.module.css"
import { ScreenNavSettingsFaceFrame } from "./screen-nav-settings-face-frame.tsx"
import { FACES, type Face } from "./screen-nav-settings-face.tsx"
import gearStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

const NAV_GROUP_LABEL = "あなたの好み"

/** 読み上げに渡す名前（歯車は絵だけなので、名前は `aria-label` と `title` で渡す）。 */
const SETTINGS_LABEL = "設定"

/** 帯の右端の歯車とダイアログ。置くのは広い画面の帯だけ（狭い画面では CSS の `@media` が帯から消す）。 */
export function ScreenNavSettingsGear(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  // 預け先はここで分解して受ける。
  // `settings.toggleRef` の形のまま `ref` に渡すと、`react(refs)` が `settings` への参照ごとレンダー中の ref の読み書きとみなして落ちる。
  const { toggleRef } = settings

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div className={clsx(gearStyles["screen-nav-settings"], shellStyles["screen-nav-settings"])}>
      <button
        type="button"
        ref={toggleRef}
        className={gearStyles["screen-nav-settings-toggle"]}
        aria-haspopup="dialog"
        aria-label={SETTINGS_LABEL}
        title={SETTINGS_LABEL}
        onClick={settings.onOpen}
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>
      <Dialog
        open={settings.open}
        ariaLabel={SETTINGS_LABEL}
        backdrop="dim"
        placement={{ kind: "auto" }}
        onClose={settings.onClose}
        className={styles["dialog"]}
      >
        {settings.open && <ScreenNavSettingsDialogBody settings={settings} />}
      </Dialog>
    </div>
  )
}

function ScreenNavSettingsDialogBody(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const [selectedKey, setSelectedKey] = useState<string>(FACES[0].key)
  const selected: Face = FACES.find((face) => face.key === selectedKey) ?? FACES[0]

  return (
    <>
      <header className={styles["head"]}>
        <Settings size={18} strokeWidth={1.8} className={styles["head-icon"]} />
        <Text
          element="p"
          size="subheading"
          tone="ink"
          weight="bold"
          className={styles["head-title"]}
        >
          設定
        </Text>
        <button
          type="button"
          className={styles["close"]}
          aria-label="閉じる（Esc）"
          onClick={settings.onClose}
        >
          <X size={18} strokeWidth={1.8} />
        </button>
      </header>
      <div className={styles["main"]}>
        <nav className={styles["nav"]} aria-label="設定の項目">
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["nav-group"]}
          >
            {NAV_GROUP_LABEL}
          </Text>
          {FACES.map((face) => {
            const Icon = face.icon
            const isSelected = face.key === selected.key
            return (
              <button
                type="button"
                key={face.key}
                className={clsx(styles["nav-item"], isSelected && styles["nav-item-selected"])}
                aria-current={isSelected ? "page" : undefined}
                onClick={() => {
                  setSelectedKey(face.key)
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
                {face.label}
              </button>
            )
          })}
        </nav>
        <section className={styles["face"]} aria-label={selected.label}>
          <SelectedFace face={selected} settings={settings} />
        </section>
      </div>
    </>
  )
}

function SelectedFace(props: {
  readonly face: Face
  readonly settings: ScreenNavSettingsProps["settings"]
}): ReactElement {
  const { face, settings } = props
  if (face.foot === "own") {
    return <face.Body title={face.label} />
  }
  return (
    <ScreenNavSettingsFaceFrame
      title={face.label}
      foot={
        <Button
          variant="outline"
          size="label"
          pressed="none"
          disabled={settings.resetDisabled}
          disclosure={{ kind: "none" }}
          className={styles["reset"]}
          onClick={settings.onReset}
        >
          既定に戻す
        </Button>
      }
    >
      <face.Body settings={settings} />
    </ScreenNavSettingsFaceFrame>
  )
}
