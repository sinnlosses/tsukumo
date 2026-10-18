// モデル・effort・許可モードの吊り札の選択肢（`RunSettingSelectOption`）の組み立て。
// サイドバーの帯の操作子（`RunSettingGroup`）と設定の「セッションの既定」が、同じ行の中身を使う。
//
// 絵は道具の線画なのでコードに置く（キャラクターの中身ではない）。
// モデルは頭文字を丸で囲み、effort は段の数だけ伸びる棒、許可モードは盾の形の違いで見分ける。
// 名前の span の `data-part="name"` は、設定の欄の閉じた口が名前だけを拾う目印。

import clsx from "clsx"
import {
  ShieldCheck,
  ShieldEllipsis,
  ShieldHalf,
  ShieldOff,
  ShieldQuestionMark,
  type LucideIcon,
} from "lucide-react"
import type { ReactElement } from "react"

import type { EffortLevel, PermissionMode } from "../../../../shared/command.ts"
import type { ModelEffortSupport } from "../../../../shared/session/session-event-setting.ts"
import {
  EFFORT_LABELS,
  EFFORT_PLACEHOLDER_VALUE,
  effortLabel,
  modelEffortNote,
  type EffortSelect,
} from "../../../domain/effort-label.ts"
import { MODEL_LABELS, modelDescription } from "../../../domain/model-label.ts"
import {
  BYPASS_PERMISSIONS_NOTICE,
  PERMISSION_MODE_LABELS,
  permissionModeShieldFill,
} from "../../../domain/permission-mode-label.ts"
import styles from "./run-setting-option.module.css"
import selectStyles from "./run-setting-select.module.css"
import type { RunSettingSelectOption } from "./run-setting-select.tsx"

const PERMISSION_MODE_ICON = {
  default: ShieldQuestionMark,
  acceptEdits: ShieldHalf,
  auto: ShieldCheck,
  plan: ShieldEllipsis,
  bypassPermissions: ShieldOff,
} satisfies Record<PermissionMode, LucideIcon>

export function modelSelectOptions(
  support: readonly ModelEffortSupport[],
): readonly RunSettingSelectOption[] {
  return MODEL_LABELS.map(([value, label]) => {
    const description = modelDescription(value)
    const note = modelEffortNote(value, support)
    return {
      value,
      disabled: false,
      icon: <ModelIcon letter={label.slice(0, 1)} />,
      row: (
        <>
          <RunSettingName danger={false}>{label}</RunSettingName>
          <span className={styles["run-setting-select-detail"]}>
            {description.summary}
            {note !== undefined && ` ・ ${note}`}
          </span>
          <ModelWeight weight={description.weight} />
        </>
      ),
    }
  })
}

export function effortSelectOptions(effort: EffortSelect): readonly RunSettingSelectOption[] {
  if (effort.kind !== "known") {
    return [
      {
        value: EFFORT_PLACEHOLDER_VALUE,
        disabled: true,
        icon: <EffortBars litCount={0} />,
        row: <RunSettingName danger={false}>{effort.reason}</RunSettingName>,
      },
    ]
  }
  const currentLitCount = effortLitCount(effort.value)
  return effort.options.map((value) => ({
    value,
    disabled: false,
    // 閉じた口は選ばれている行の絵だけが写る。選ばれていない行の絵は出ない（`.is-row` が消す）。
    icon: <EffortBars litCount={effortLitCount(value)} />,
    row: (
      <>
        <EffortBar litCount={currentLitCount} atIndex={effortLitCount(value) - 1} />
        <RunSettingName danger={false}>{effortLabel(value)}</RunSettingName>
      </>
    ),
  }))
}

/** `modes` は出す許可モード。`undefined` なら全部。 */
export function permissionModeSelectOptions(
  modes: readonly PermissionMode[] | undefined,
): readonly RunSettingSelectOption[] {
  return PERMISSION_MODE_LABELS.filter(([value]) => modes?.includes(value) ?? true).map(
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
            <RunSettingName danger={dangerous}>{label}</RunSettingName>
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
}

/** 吊り札の1行の名前。 */
export function RunSettingName(props: {
  readonly children: string
  readonly danger: boolean
}): ReactElement {
  return (
    <span
      className={clsx(styles["run-setting-select-name"], props.danger && styles["is-danger"])}
      data-part="name"
    >
      {props.children}
    </span>
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
