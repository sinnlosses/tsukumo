// 設定のダイアログの中身。頭（歯車の線画・「設定」・×）、左のナビ、右の面、下の帯（既定に戻す）を組む。
// 面は `FACES` に1行ずつ宣言し、足すときはここへ1行書けばナビと面の両方に出る。
// 選んでいる面はこの部品の `useState` が持つ。ダイアログを閉じると部品ごと消えるので、開くたび先頭の面から始まる。

import clsx from "clsx"
import { Palette, Settings, SlidersHorizontal, Sparkles, Workflow, X } from "lucide-react"
import { useState, type ComponentType, type ReactElement } from "react"

import { Button } from "../../../ui/button/button.tsx"
import { Dialog } from "../../../ui/dialog/dialog.tsx"
import { Text } from "../../../ui/text/text.tsx"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-settings-dialog.module.css"
import { ScreenNavSettingsLookFace } from "./screen-nav-settings-look.tsx"
import { ScreenNavSettingsWorkflowFace } from "./screen-nav-settings-workflow.tsx"
import gearStyles from "./screen-nav-settings.module.css"
import {
  ScreenNavSettingsRevealFace,
  ScreenNavSettingsSessionDefaultFace,
  type ScreenNavSettingsProps,
} from "./screen-nav-settings.tsx"

type Face = {
  readonly key: string
  readonly label: string
  readonly icon: ComponentType<{ readonly size: number; readonly strokeWidth: number }>
  readonly Body: (props: ScreenNavSettingsProps) => ReactElement
  /** 下の帯（画面の色の「既定に戻す」）を出すか。色と関わらない値を書く面には出さない。 */
  readonly foot: "reset" | "none"
}

const FACES = [
  { key: "look", label: "見た目", icon: Palette, Body: ScreenNavSettingsLookFace, foot: "reset" },
  {
    key: "session-default",
    label: "セッションの既定",
    icon: SlidersHorizontal,
    Body: ScreenNavSettingsSessionDefaultFace,
    foot: "reset",
  },
  { key: "reveal", label: "演出", icon: Sparkles, Body: DialogRevealFace, foot: "reset" },
  // ワークフローの値は歯車の設定（`settings`）に無く、面が自分で読み書きする。
  {
    key: "workflow",
    label: "ワークフロー",
    icon: Workflow,
    Body: ScreenNavSettingsWorkflowFace,
    foot: "none",
  },
] satisfies readonly [Face, ...Face[]]

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
  const selected = FACES.find((face) => face.key === selectedKey) ?? FACES[0]
  const SelectedBody = selected.Body

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
          <div className={styles["face-scroll"]}>
            <Text
              element="p"
              size="heading"
              tone="ink"
              weight="bold"
              className={styles["face-title"]}
            >
              {selected.label}
            </Text>
            <div className={gearStyles["screen-nav-settings-table"]}>
              <SelectedBody settings={settings} />
            </div>
          </div>
          {selected.foot === "reset" && (
            <footer className={styles["foot"]}>
              <Button
                variant="outline"
                size="label"
                pressed="none"
                disabled={settings.resetDisabled}
                ariaLabel={undefined}
                disclosure={{ kind: "none" }}
                ariaHasPopup={undefined}
                title={undefined}
                className={styles["reset"]}
                onClick={settings.onReset}
              >
                既定に戻す
              </Button>
            </footer>
          )}
        </section>
      </div>
    </>
  )
}

/** 引き出しの行「速さ」と違い、面の名前が「演出」なので行の名前に「書き上げる」を足す。 */
function DialogRevealFace(props: ScreenNavSettingsProps): ReactElement {
  return <ScreenNavSettingsRevealFace settings={props.settings} label="書き上げる速さ" />
}
