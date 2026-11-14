// 入力欄の下の行に置く、モデル・effort・許可モードの3つの札。選ぶと、いま動いているセッションの値を変える。
// effort の段が分からないあいだ（対応しないモデル・まだ届かない）は effort の札を描かない。
// キーボードの操作・読み上げ・選択肢の開き方はブラウザに任せ、何の値かは `aria-label` と `title` に「モデル Opus」の形で渡す。

import { useId, type ReactElement } from "react"

import { isModelAlias } from "../../../shared/session/run-setting-value.ts"
import { permissionModeValue } from "../../../shared/session/session-info.ts"
import { effortLabel } from "../../domain/effort-label.ts"
import { modelLabel } from "./model-label.ts"
import { type SettingDot, useModelPermission } from "./model-permission.ts"
import { PERMISSION_MODE_LABELS, permissionModeLabel } from "./permission-mode-label.ts"
import {
  effortSelectOptions,
  modelSelectOptions,
  permissionModeSelectOptions,
  unknownModelOption,
  unknownPermissionModeOption,
} from "./run-setting-option.tsx"
import { RunSettingSelect } from "./run-setting-select.tsx"

export function RunSettingGroup(): ReactElement {
  const control = useModelPermission()
  const modelSelectId = useId()
  const effortSelectId = useId()
  const permissionModeSelectId = useId()

  const modelText = modelLabel(control.model)
  const permissionModeText = permissionModeLabel(control.permissionMode)
  const { effort } = control

  return (
    <>
      <RunSettingSelect
        id={modelSelectId}
        ariaLabel={`モデル ${modelText}`}
        heading="モデル（このセッション）"
        value={control.model}
        options={[
          ...modelSelectOptions(control.modelEffortSupport),
          ...(isModelAlias(control.model) ? [] : [unknownModelOption(control.model)]),
        ]}
        disabled={false}
        danger={false}
        rail={false}
        layout="list"
        mouth="chip"
        title={dotTitle(`モデル ${modelText}`, control.modelDot)}
        dot={control.modelDot}
        onChange={control.onSetModel}
      />
      {effort.kind === "known" && (
        <RunSettingSelect
          id={effortSelectId}
          ariaLabel={`effort ${effortLabel(effort.value)}`}
          heading="考える深さ（このセッション）"
          value={effort.value}
          options={effortSelectOptions(effort)}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="chip"
          title={dotTitle(`effort ${effortLabel(effort.value)}`, control.effortDot)}
          dot={control.effortDot}
          onChange={control.onSetEffort}
        />
      )}
      <RunSettingSelect
        id={permissionModeSelectId}
        ariaLabel={`許可モード ${permissionModeText}`}
        heading="許可モード（このセッション）"
        value={permissionModeValue(control.permissionMode)}
        options={[
          ...permissionModeSelectOptions(PERMISSION_MODE_LABELS.map(([mode]) => mode)),
          ...(typeof control.permissionMode === "string"
            ? []
            : [unknownPermissionModeOption(control.permissionMode.raw)]),
        ]}
        disabled={false}
        danger={control.permissionModeDangerous}
        rail={false}
        layout="list"
        mouth="chip"
        title={dotTitle(`許可モード ${permissionModeText}`, control.permissionModeDot)}
        dot={control.permissionModeDot}
        onChange={control.onSetPermissionMode}
      />
    </>
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
