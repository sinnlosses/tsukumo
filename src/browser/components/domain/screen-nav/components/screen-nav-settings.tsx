// 帯の右端の歯車と、押すと開く**設定**のポップオーバー（docs/screen-design.md 13.6 / 13.9「設定の
// 歯車」）。ロジックは `hooks/use-settings.ts`、ここは受け取った値をそのまま置く器
// （2章「機能の中を分ける」）。
//
// **区切りの見出し + ラベルと操作子の2列**（13.9 が指す設定のモックの形）。群は「画面の色」・
// 「新しいセッションの既定」・「書き上げる演出の速さ」・「訪問」の4つ。
//
// **同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く**（「いまの作業」の札と同じ
// 畳み方。どちらを出すかは CSS の `@media` が決める）。開閉の状態は1つの hook が持つので、
// どちらから押しても同じ面が開く——**id は `useId()` でこの器ごとに振る**（2箇所に描くため、
// `aria-controls` と `<label for>` が指す先が重ならないようにする）。**Esc の戻り先として歯車の
// DOM を預ける口（`settings.toggleRef`）も、2箇所ぶんを集めるコールバック ref**（`use-settings.ts`）。

import { useId, type ReactElement } from "react"

import { isSessionDefaultPermissionMode } from "../../../../../shared/session-default.ts"
import { HStack } from "../../../../components/ui/h-stack/h-stack.tsx"
import { Select } from "../../../../components/ui/select/select.tsx"
import { Text } from "../../../../components/ui/text/text.tsx"
import { REVEAL_SPEED_LABELS } from "../../../../domain/reveal-speed.ts"
import { EFFORT_PLACEHOLDER_VALUE, effortLabel } from "../domain/effort-label.ts"
import { MODEL_LABELS } from "../domain/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../domain/permission-mode-label.ts"
import { VISIT_TOGGLE_LABELS } from "../domain/visit-toggle-label.ts"
import { type ScreenNavSettings } from "../hooks/use-settings.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-settings.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
}

/** 読み上げに渡す名前（歯車は絵だけなので、名前は `aria-label` と `title` で渡す）。 */
const SETTINGS_LABEL = "設定"

/** 既定の `<select>` に出すモデル（帯のドロップダウンと同じ4つ・同じ順）。 */
const MODEL_OPTIONS = MODEL_LABELS.map(([value, label]) => ({ value, label }))

/**
 * 既定の `<select>` に出す許可モード。**「全部許す」は落とす**（既定には選べない。
 * `src/shared/session-default.ts`）——帯のドロップダウンからはその都度選べる。
 */
const PERMISSION_MODE_OPTIONS = PERMISSION_MODE_LABELS.filter(([value]) =>
  isSessionDefaultPermissionMode(value),
).map(([value, label]) => ({ value, label }))

/** 「書き上げる演出の速さ」の `<select>` に出す選択肢（`REVEAL_SPEED_LABELS` の並びのまま）。 */
const REVEAL_SPEED_OPTIONS = REVEAL_SPEED_LABELS.map(([value, label]) => ({ value, label }))

/** 「訪問」の `<select>` に出す選択肢（`VISIT_TOGGLE_LABELS` の並びのまま）。 */
const VISIT_TOGGLE_OPTIONS = VISIT_TOGGLE_LABELS.map(([value, label]) => ({ value, label }))

export function ScreenNavSettingsGear(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  // **預け先はここで分解して受ける**（`settings.toggleRef` の形のまま `ref` に渡すと、
  // `react(refs)`（規約「レンダー中に ref を読み書きしない」）が `settings` への参照ごと
  // レンダー中の ref の読み書きとみなして落ちる。`presentational-screen-nav.tsx` と同じ事情）。
  const { toggleRef } = settings
  const panelId = useId()
  const fieldId = useId()

  // **`shellStyles` は見た目を持たない**（広い画面から隠す規則
  // `.screen-nav > .screen-nav-settings` と「≡」の面の中で縦に積む規則
  // `.screen-nav-panel .screen-nav-settings*` のためだけの参照）。CSS Modules は class 名を
  // ファイルごとにハッシュ化するので、`screen-nav.module.css` 側の選択子を当てるにはこのファイル
  // 自身の class も要る（docs/design.md 6.6）。
  return (
    <div className={`${styles["screen-nav-settings"]} ${shellStyles["screen-nav-settings"]}`}>
      <button
        type="button"
        ref={toggleRef}
        className={`${styles["screen-nav-settings-toggle"]} ${shellStyles["screen-nav-settings-toggle"]}`}
        aria-expanded={settings.open}
        aria-controls={panelId}
        aria-label={SETTINGS_LABEL}
        title={SETTINGS_LABEL}
        onClick={settings.onToggle}
      >
        <GearIcon />
      </button>
      {settings.open ? (
        <div
          id={panelId}
          className={`${styles["screen-nav-settings-panel"]} ${shellStyles["screen-nav-settings-panel"]}`}
          role="region"
          aria-label={SETTINGS_LABEL}
        >
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"] ?? ""}
          >
            画面の色
          </Text>
          {settings.colors.map((color) => (
            <HStack
              element="div"
              gap="lg"
              align="center"
              justify="between"
              wrap="nowrap"
              className={styles["screen-nav-settings-row"] ?? ""}
              key={color.key}
            >
              <label htmlFor={`${fieldId}-${color.key}`}>{color.label}</label>
              <input
                id={`${fieldId}-${color.key}`}
                type="color"
                value={color.value}
                onChange={(event) => {
                  color.onChange(event.target.value)
                }}
              />
            </HStack>
          ))}
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"] ?? ""}
          >
            新しいセッションの既定
          </Text>
          <HStack
            element="div"
            gap="lg"
            align="center"
            justify="between"
            wrap="nowrap"
            className={styles["screen-nav-settings-row"] ?? ""}
          >
            <label htmlFor={`${fieldId}-default-model`}>モデル</label>
            <Select
              id={`${fieldId}-default-model`}
              ariaLabel="新しいセッションの既定のモデル"
              frameClassName={styles["screen-nav-settings-select-frame"] ?? ""}
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.sessionDefault.model}
              disabled={false}
              title={undefined}
              options={MODEL_OPTIONS}
              onChange={settings.sessionDefault.onChangeModel}
            />
          </HStack>
          <HStack
            element="div"
            gap="lg"
            align="center"
            justify="between"
            wrap="nowrap"
            className={styles["screen-nav-settings-row"] ?? ""}
          >
            <label htmlFor={`${fieldId}-default-effort`}>effort</label>
            {settings.sessionDefault.effort.kind === "known" ? (
              <Select
                id={`${fieldId}-default-effort`}
                ariaLabel="新しいセッションの既定の effort"
                frameClassName={styles["screen-nav-settings-select-frame"] ?? ""}
                className={styles["screen-nav-settings-select"] ?? ""}
                value={settings.sessionDefault.effort.value}
                disabled={false}
                title={undefined}
                options={settings.sessionDefault.effort.options.map((value) => ({
                  value,
                  label: effortLabel(value),
                }))}
                onChange={settings.sessionDefault.onChangeEffort}
              />
            ) : (
              <Select
                id={`${fieldId}-default-effort`}
                ariaLabel="新しいセッションの既定の effort"
                frameClassName={styles["screen-nav-settings-select-frame"] ?? ""}
                className={styles["screen-nav-settings-select"] ?? ""}
                value={EFFORT_PLACEHOLDER_VALUE}
                disabled={true}
                title={settings.sessionDefault.effort.reason}
                options={[{ value: EFFORT_PLACEHOLDER_VALUE, label: "—" }]}
                onChange={() => {}}
              />
            )}
          </HStack>
          <HStack
            element="div"
            gap="lg"
            align="center"
            justify="between"
            wrap="nowrap"
            className={styles["screen-nav-settings-row"] ?? ""}
          >
            <label htmlFor={`${fieldId}-default-permission-mode`}>許可モード</label>
            <Select
              id={`${fieldId}-default-permission-mode`}
              ariaLabel="新しいセッションの既定の許可モード"
              frameClassName={styles["screen-nav-settings-select-frame"] ?? ""}
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.sessionDefault.permissionMode}
              disabled={false}
              title={undefined}
              options={PERMISSION_MODE_OPTIONS}
              onChange={settings.sessionDefault.onChangePermissionMode}
            />
          </HStack>
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"] ?? ""}
          >
            書き上げる演出の速さ
          </Text>
          <HStack
            element="div"
            gap="lg"
            align="center"
            justify="between"
            wrap="nowrap"
            className={styles["screen-nav-settings-row"] ?? ""}
          >
            <label htmlFor={`${fieldId}-reveal-speed`}>速さ</label>
            <Select
              id={`${fieldId}-reveal-speed`}
              ariaLabel="書き上げる演出の速さ"
              frameClassName={styles["screen-nav-settings-select-frame"] ?? ""}
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.revealSpeed.value}
              disabled={false}
              title={undefined}
              options={REVEAL_SPEED_OPTIONS}
              onChange={settings.revealSpeed.onChange}
            />
          </HStack>
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"] ?? ""}
          >
            訪問
          </Text>
          <HStack
            element="div"
            gap="lg"
            align="center"
            justify="between"
            wrap="nowrap"
            className={styles["screen-nav-settings-row"] ?? ""}
          >
            <label htmlFor={`${fieldId}-visit-enabled`}>客の出入り</label>
            <Select
              id={`${fieldId}-visit-enabled`}
              ariaLabel="訪問のオン・オフ"
              frameClassName={styles["screen-nav-settings-select-frame"] ?? ""}
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.visit.value}
              disabled={false}
              title={undefined}
              options={VISIT_TOGGLE_OPTIONS}
              onChange={settings.visit.onChange}
            />
          </HStack>
          <HStack
            element="div"
            gap="lg"
            align="center"
            justify="between"
            wrap="nowrap"
            className={styles["screen-nav-settings-row"] ?? ""}
          >
            <button
              type="button"
              className={styles["screen-nav-settings-reset"]}
              disabled={settings.resetDisabled}
              onClick={settings.onReset}
            >
              既定に戻す
            </button>
          </HStack>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 歯車の絵（見本の `<header>` の線画。docs/screen-design.md 13.9「設定の歯車」）。
 * 字の「⚙」はフォントによって大きさも太さも揃わないので、仕事 / 雑談のトグルと同じく
 * `aria-hidden` のインライン SVG + `currentColor` で描く。
 */
function GearIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}
