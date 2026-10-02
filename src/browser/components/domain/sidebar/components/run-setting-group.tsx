// モデル・effort・許可モードの3つの操作子。サイドバーの下端の帯の左端と、中くらいの窓幅の柱に置く。
// どれも絵だけの小さな口で、押すとブラウザの `<select>` の選択肢が開く（絵の上に透明の `<select>` を重ねる）。
// キーボードの操作・読み上げ・選択肢の開き方はブラウザに任せ、何の値かは `aria-label` と `title` に「モデル Opus」の形で渡す。
//
// 絵は道具の線画なのでコードに置く（キャラクターの中身ではない）。
// モデルは頭文字を丸で囲み、effort は段の数だけ伸びる棒、許可モードは盾の形の違いで見分ける。

import clsx from "clsx"
import {
  ShieldCheck,
  ShieldEllipsis,
  ShieldHalf,
  ShieldOff,
  ShieldQuestionMark,
  type LucideIcon,
} from "lucide-react"
import { useId, type ReactElement, type ReactNode } from "react"

import type { PermissionMode } from "../../../../../shared/command.ts"
import {
  EFFORT_LABELS,
  EFFORT_PLACEHOLDER_VALUE,
  effortLabel,
} from "../../../../domain/effort-label.ts"
import { MODEL_LABELS } from "../../../../domain/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../../domain/permission-mode-label.ts"
import { useModelPermission } from "../../../../stores/model-permission.ts"
import { Select } from "../../../ui/select/select.tsx"
import styles from "./run-setting-group.module.css"

const PERMISSION_MODE_ICON = {
  default: ShieldQuestionMark,
  acceptEdits: ShieldHalf,
  auto: ShieldCheck,
  plan: ShieldEllipsis,
  bypassPermissions: ShieldOff,
} satisfies Record<PermissionMode, LucideIcon>

export type RunSettingPlacement = "sidebar-footer" | "rail"

const PLACEMENT_CLASS = {
  "sidebar-footer": styles["run-setting-group-footer"],
  rail: styles["run-setting-group-rail"],
} satisfies Record<RunSettingPlacement, string>

export function RunSettingGroup(props: { readonly placement: RunSettingPlacement }): ReactElement {
  const control = useModelPermission()
  const modelSelectId = useId()
  const effortSelectId = useId()
  const permissionModeSelectId = useId()

  const modelLabel = labelOf(MODEL_LABELS, control.model)
  const permissionModeLabel = labelOf(PERMISSION_MODE_LABELS, control.permissionMode)
  const PermissionIcon = PERMISSION_MODE_ICON[control.permissionMode]
  const { effort } = control

  return (
    <div
      className={clsx(styles["run-setting-group"], PLACEMENT_CLASS[props.placement])}
      role="group"
      aria-label="実行の設定"
    >
      <RunSetting
        id={modelSelectId}
        name={`モデル ${modelLabel}`}
        value={control.model}
        options={MODEL_LABELS.map(([value, label]) => ({ value, label }))}
        disabled={false}
        danger={false}
        onChange={control.onSetModel}
      >
        <span className={styles["run-setting-model"]}>{modelLabel.slice(0, 1)}</span>
      </RunSetting>
      <span className={styles["run-setting-divider"]} aria-hidden="true" />
      {effort.kind === "known" ? (
        <RunSetting
          id={effortSelectId}
          name={`effort ${effortLabel(effort.value)}`}
          value={effort.value}
          options={effort.options.map((value) => ({ value, label: effortLabel(value) }))}
          disabled={false}
          danger={false}
          onChange={control.onSetEffort}
        >
          <EffortBars litCount={EFFORT_LABELS.findIndex(([value]) => value === effort.value) + 1} />
        </RunSetting>
      ) : (
        <RunSetting
          id={effortSelectId}
          name={`effort ${effort.reason}`}
          value={EFFORT_PLACEHOLDER_VALUE}
          options={[{ value: EFFORT_PLACEHOLDER_VALUE, label: "—" }]}
          disabled={true}
          danger={false}
          onChange={() => {}}
        >
          <EffortBars litCount={0} />
        </RunSetting>
      )}
      <span className={styles["run-setting-divider"]} aria-hidden="true" />
      <RunSetting
        id={permissionModeSelectId}
        name={`許可モード ${permissionModeLabel}`}
        value={control.permissionMode}
        options={PERMISSION_MODE_LABELS.map(([value, label]) => ({ value, label }))}
        disabled={false}
        danger={control.permissionModeDangerous}
        onChange={control.onSetPermissionMode}
      >
        <PermissionIcon size={16} strokeWidth={1.9} aria-hidden="true" />
      </RunSetting>
    </div>
  )
}

/**
 * 絵1つぶんの口。絵の上に同じ大きさの透明の `<select>` を重ね、押したところがそのまま `<select>` になる。
 * フォーカスの輪と hover の地は口の側に描く（`<select>` 自身は見えないので）。
 */
function RunSetting(props: {
  readonly id: string
  /** 何の値か（「モデル Opus」）。`aria-label` と `title` に同じものを渡す。 */
  readonly name: string
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly disabled: boolean
  /** 「全部許す」のときだけ絵に意味の色を載せる（名前に「全部許す」が必ず入るので、色だけで伝えない）。 */
  readonly danger: boolean
  readonly onChange: (value: string) => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <span
      className={clsx(
        styles["run-setting"],
        props.disabled && styles["is-disabled"],
        props.danger && styles["is-danger"],
      )}
      title={props.name}
    >
      {props.children}
      <Select
        id={props.id}
        ariaLabel={props.name}
        frameClassName={styles["run-setting-frame"]}
        className={styles["run-setting-select"]}
        value={props.value}
        disabled={props.disabled}
        title={props.name}
        options={props.options}
        onChange={props.onChange}
      />
    </span>
  )
}

/** effort の段の棒。段の数だけ並べ、いまの段まで字の色で塗る（`litCount` が 0 なら全部を弱い色）。 */
function EffortBars(props: { readonly litCount: number }): ReactElement {
  return (
    <span className={styles["run-setting-effort"]} aria-hidden="true">
      {EFFORT_LABELS.map(([value], index) => (
        <span
          key={value}
          className={clsx(
            styles["run-setting-effort-bar"],
            index < props.litCount && styles["is-lit"],
          )}
          style={{ height: `${String(4 + index * 2.5)}px` }}
        />
      ))}
    </span>
  )
}

/** ラベルの表から値の字を引く。無ければ値をそのまま返す。 */
function labelOf(labels: readonly (readonly [string, string])[], value: string): string {
  return labels.find(([candidate]) => candidate === value)?.[1] ?? value
}
