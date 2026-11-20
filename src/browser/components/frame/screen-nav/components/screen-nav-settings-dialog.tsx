// 設定のダイアログの中身。頭（歯車の線画・「設定」・×）、左のナビ、右の面を組む。
// 選んでいる面は開閉の店（`useSettingsRequest`）が持つので、閉じて開き直しても最後に見た面で開く。

import clsx from "clsx"
import { Settings, X } from "lucide-react"
import { Fragment, type ReactElement } from "react"

import { useSettingsRequest } from "../../../../stores/settings-request.ts"
import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { useWorkflowRepositoryName } from "../hooks/use-workflow-repository-name.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-settings-dialog.module.css"
import { ScreenNavSettingsFaceFrame } from "./screen-nav-settings-face-frame.tsx"
import { FACES, FACE_GROUPS, type Face } from "./screen-nav-settings-face.tsx"
import gearStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

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
  const selectedKey = useSettingsRequest((state) => state.faceKey)
  const selectFace = useSettingsRequest((state) => state.selectFace)
  const selected: Face = FACES.find((face) => face.key === selectedKey) ?? FACES[0]
  const repositoryName = useWorkflowRepositoryName()

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
          {FACE_GROUPS.map((faceGroup) => {
            const aside = faceGroup.group === "repository" ? repositoryName : faceGroup.aside
            return (
              <Fragment key={faceGroup.group}>
                <Text
                  element="p"
                  size="label"
                  tone="ink-quiet"
                  weight="inherit"
                  className={styles["nav-group"]}
                >
                  <span>{faceGroup.label}</span>
                  {aside !== "" && <span>{aside}</span>}
                </Text>
                {FACES.filter((face) => face.group === faceGroup.group).map((face) => {
                  const Icon = face.icon
                  const isSelected = face.key === selected.key
                  const changedCount =
                    face.foot === "reset" ? settings.pageReset[face.key].count : 0
                  return (
                    <button
                      type="button"
                      key={face.key}
                      title={
                        changedCount > 0
                          ? `既定と違う項目が ${String(changedCount)} 件ある`
                          : undefined
                      }
                      className={clsx(
                        styles["nav-item"],
                        isSelected && styles["nav-item-selected"],
                      )}
                      aria-current={isSelected ? "page" : undefined}
                      onClick={() => {
                        selectFace(face.key)
                      }}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                      {face.label}
                      {changedCount > 0 && (
                        <span className={styles["nav-count"]} aria-hidden="true">
                          {changedCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </Fragment>
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
    return <face.Body title={face.label} store={{ group: face.group, store: face.store }} />
  }
  const reset = settings.pageReset[face.key]
  return (
    <ScreenNavSettingsFaceFrame
      title={face.label}
      store={{ group: face.group, store: face.store }}
      foot={
        <Button
          variant="outline"
          size="label"
          pressed="none"
          disabled={reset.count === 0}
          disclosure={{ kind: "none" }}
          className={styles["reset"]}
          onClick={reset.onReset}
        >
          {`このページを既定に戻す（${String(reset.count)}件）`}
        </Button>
      }
    >
      <face.Body settings={settings} />
    </ScreenNavSettingsFaceFrame>
  )
}
