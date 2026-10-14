// モデル・effort・許可モードの3つの操作子。サイドバーの下端の帯の左端と、中くらいの窓幅の柱と、狭い画面の引き出しの動き方の段に置く。
// どれも絵だけの小さな口で、押すと `RunSettingSelect` が吊り札を開く。
// キーボードの操作・読み上げ・選択肢の開き方はブラウザに任せ、何の値かは `aria-label` と `title` に「モデル Opus」の形で渡す。

import clsx from "clsx"
import { useId, type ReactElement } from "react"

import { EFFORT_PLACEHOLDER_VALUE, effortLabel } from "../../../domain/effort-label.ts"
import { MODEL_LABELS } from "../../../domain/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../domain/permission-mode-label.ts"
import { type SettingDot, useModelPermission } from "../../../stores/model-permission.ts"
import styles from "./run-setting-group.module.css"
import {
  effortSelectOptions,
  modelSelectOptions,
  permissionModeSelectOptions,
} from "./run-setting-option.tsx"
import { RunSettingSelect } from "./run-setting-select.tsx"

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
        options={modelSelectOptions(control.modelEffortSupport)}
        disabled={false}
        danger={false}
        rail={rail}
        layout="list"
        mouth="icon"
        title={dotTitle(`モデル ${modelLabel}`, control.modelDot)}
        dot={control.modelDot}
        onChange={control.onSetModel}
      />
      <span className={styles["run-setting-divider"]} aria-hidden="true" />
      <RunSettingSelect
        id={effortSelectId}
        ariaLabel={`effort ${effortName}`}
        heading="effort"
        value={effortValue}
        options={effortSelectOptions(effort)}
        disabled={effort.kind !== "known"}
        danger={false}
        rail={rail}
        layout="row"
        mouth="icon"
        title={dotTitle(`effort ${effortName}`, control.effortDot)}
        dot={control.effortDot}
        onChange={control.onSetEffort}
      />
      <span className={styles["run-setting-divider"]} aria-hidden="true" />
      <RunSettingSelect
        id={permissionModeSelectId}
        ariaLabel={`許可モード ${permissionModeLabel}`}
        heading="許可モード"
        value={control.permissionMode}
        options={permissionModeSelectOptions(undefined)}
        disabled={false}
        danger={control.permissionModeDangerous}
        rail={rail}
        layout="list"
        mouth="icon"
        title={dotTitle(`許可モード ${permissionModeLabel}`, control.permissionModeDot)}
        dot={control.permissionModeDot}
        onChange={control.onSetPermissionMode}
      />
    </div>
  )
}

function dotTitle(title: string, dot: SettingDot): string {
  switch (dot) {
    case "accepted":
      return `${title} ・ 受け付けた`
    case "confirmed":
      return `${title} ・ 効いた`
    case "none":
      return title
  }
}

/** ラベルの表から値の字を引く。無ければ値をそのまま返す。 */
function labelOf(labels: readonly (readonly [string, string])[], value: string): string {
  return labels.find(([candidate]) => candidate === value)?.[1] ?? value
}
