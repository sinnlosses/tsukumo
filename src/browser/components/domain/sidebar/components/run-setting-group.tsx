// モデル・effort・許可モードの3つの操作子。サイドバーの下端の帯の左端と、中くらいの窓幅の柱と、狭い画面の引き出しの動き方の段に置く。
// どれも絵だけの小さな口で、押すと `RunSettingSelect` が吊り札を開く。
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
import { useId, type ReactElement } from "react"

import type { EffortLevel, PermissionMode } from "../../../../../shared/command.ts"
import {
  EFFORT_LABELS,
  EFFORT_PLACEHOLDER_VALUE,
  effortLabel,
  modelEffortNote,
} from "../../../../domain/effort-label.ts"
import { MODEL_LABELS, modelDescription } from "../../../../domain/model-label.ts"
import {
  BYPASS_PERMISSIONS_NOTICE,
  PERMISSION_MODE_LABELS,
  permissionModeShieldFill,
} from "../../../../domain/permission-mode-label.ts"
import { useModelPermission } from "../../../../stores/model-permission.ts"
import styles from "./run-setting-group.module.css"
import selectStyles from "./run-setting-select.module.css"
import { RunSettingSelect, type RunSettingSelectOption } from "./run-setting-select.tsx"

const PERMISSION_MODE_ICON = {
  default: ShieldQuestionMark,
  acceptEdits: ShieldHalf,
  auto: ShieldCheck,
  plan: ShieldEllipsis,
  bypassPermissions: ShieldOff,
} satisfies Record<PermissionMode, LucideIcon>

export type RunSettingPlacement = "sidebar-footer" | "rail" | "nav-drawer"

const PLACEMENT_CLASS = {
  "sidebar-footer": styles["run-setting-group-footer"],
  rail: styles["run-setting-group-rail"],
  "nav-drawer": styles["run-setting-group-drawer"],
} satisfies Record<RunSettingPlacement, string>

export function RunSettingGroup(props: { readonly placement: RunSettingPlacement }): ReactElement {
  const control = useModelPermission()
  const modelSelectId = useId()
  const effortSelectId = useId()
  const permissionModeSelectId = useId()
  const rail = props.placement === "rail"

  const modelLabel = labelOf(MODEL_LABELS, control.model)
  const permissionModeLabel = labelOf(PERMISSION_MODE_LABELS, control.permissionMode)
  const { effort } = control
  const effortName = effort.kind === "known" ? effortLabel(effort.value) : effort.reason
  const effortValue = effort.kind === "known" ? effort.value : EFFORT_PLACEHOLDER_VALUE

  const modelOptions: readonly RunSettingSelectOption[] = MODEL_LABELS.map(([value, label]) => {
    const description = modelDescription(value)
    const note = modelEffortNote(value, control.modelEffortSupport)
    return {
      value,
      disabled: false,
      icon: <ModelIcon letter={label.slice(0, 1)} />,
      row: (
        <>
          <span className={styles["run-setting-select-name"]}>{label}</span>
          <span className={styles["run-setting-select-detail"]}>
            {description.summary}
            {note !== undefined && ` ・ ${note}`}
          </span>
          <ModelWeight weight={description.weight} />
        </>
      ),
    }
  })

  const currentLitCount = effort.kind === "known" ? effortLitCount(effort.value) : 0
  const effortOptions: readonly RunSettingSelectOption[] =
    effort.kind === "known"
      ? effort.options.map((value) => ({
          value,
          disabled: false,
          // 閉じた口は選ばれている行の絵だけが写る。選ばれていない行の絵は出ない（`.is-row` が消す）。
          icon: <EffortBars litCount={effortLitCount(value)} />,
          row: (
            <>
              <EffortBar litCount={currentLitCount} atIndex={effortLitCount(value) - 1} />
              <span className={styles["run-setting-select-name"]}>{effortLabel(value)}</span>
            </>
          ),
        }))
      : [
          {
            value: EFFORT_PLACEHOLDER_VALUE,
            disabled: true,
            icon: <EffortBars litCount={0} />,
            row: <span className={styles["run-setting-select-name"]}>{effort.reason}</span>,
          },
        ]

  const permissionModeOptions: readonly RunSettingSelectOption[] = PERMISSION_MODE_LABELS.map(
    ([value, label]) => {
      const PermissionIcon = PERMISSION_MODE_ICON[value]
      const dangerous = value === "bypassPermissions"
      return {
        value,
        disabled: false,
        icon: (
          <span
            className={styles["run-setting-shield"]}
            data-fill={permissionModeShieldFill(value)}
          >
            <PermissionIcon size={16} strokeWidth={1.9} aria-hidden="true" />
          </span>
        ),
        row: (
          <>
            <span
              className={clsx(styles["run-setting-select-name"], dangerous && styles["is-danger"])}
            >
              {label}
            </span>
            {dangerous && (
              <span className={clsx(styles["run-setting-select-detail"], styles["is-danger"])}>
                {BYPASS_PERMISSIONS_NOTICE}
              </span>
            )}
          </>
        ),
      }
    },
  )

  return (
    <div
      className={clsx(styles["run-setting-group"], PLACEMENT_CLASS[props.placement])}
      role="group"
      aria-label="実行の設定"
    >
      <RunSettingSelect
        id={modelSelectId}
        ariaLabel={`モデル ${modelLabel}`}
        heading="モデル"
        value={control.model}
        options={modelOptions}
        disabled={false}
        danger={false}
        rail={rail}
        layout="list"
        title={`モデル ${modelLabel}`}
        onChange={control.onSetModel}
      />
      <span className={styles["run-setting-divider"]} aria-hidden="true" />
      <RunSettingSelect
        id={effortSelectId}
        ariaLabel={`effort ${effortName}`}
        heading="effort"
        value={effortValue}
        options={effortOptions}
        disabled={effort.kind !== "known"}
        danger={false}
        rail={rail}
        layout="row"
        title={`effort ${effortName}`}
        onChange={control.onSetEffort}
      />
      <span className={styles["run-setting-divider"]} aria-hidden="true" />
      <RunSettingSelect
        id={permissionModeSelectId}
        ariaLabel={`許可モード ${permissionModeLabel}`}
        heading="許可モード"
        value={control.permissionMode}
        options={permissionModeOptions}
        disabled={false}
        danger={control.permissionModeDangerous}
        rail={rail}
        layout="list"
        title={`許可モード ${permissionModeLabel}`}
        onChange={control.onSetPermissionMode}
      />
    </div>
  )
}

/** モデルの頭文字を丸で囲んだ印。 */
function ModelIcon(props: { readonly letter: string }): ReactElement {
  return <span className={styles["run-setting-model"]}>{props.letter}</span>
}

/** モデルの重さ。狐火の●を `weight` の数だけ灯す。 */
function ModelWeight(props: { readonly weight: number }): ReactElement {
  return (
    <span className={styles["run-setting-weight"]} aria-hidden="true">
      {"●".repeat(props.weight)}
    </span>
  )
}

/**
 * effort の段の棒。段の数だけ並べ、いまの段まで字の色で塗る（`litCount` が 0 なら全部を弱い色）。
 * 閉じた口の絵（選ばれている行だけが写る）。 */
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

/** 開いた列の、1つの段ぶんの棒。いまの段（`litCount`）までを塗る。 */
function EffortBar(props: { readonly litCount: number; readonly atIndex: number }): ReactElement {
  return (
    <span
      className={clsx(
        selectStyles["run-setting-effort-bar-row"],
        props.atIndex < props.litCount && selectStyles["is-lit"],
      )}
      style={{ height: `${String(12 + props.atIndex * 8)}px` }}
      aria-hidden="true"
    />
  )
}

/** effort の段の位置（1始まり）。段の名前が一致する棒まで灯す。 */
function effortLitCount(value: EffortLevel): number {
  return EFFORT_LABELS.findIndex(([level]) => level === value) + 1
}

/** ラベルの表から値の字を引く。無ければ値をそのまま返す。 */
function labelOf(labels: readonly (readonly [string, string])[], value: string): string {
  return labels.find(([candidate]) => candidate === value)?.[1] ?? value
}
