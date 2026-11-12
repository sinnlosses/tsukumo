// 入力欄に添える、いまのモデルと考える深さの札（「Fable・High」）。見せるだけで、変える口は持たない。
// effort の段が分からないあいだ（対応しない・まだ届かない）は、モデル名だけを出す。

import type { ReactElement } from "react"

import { effortLabel } from "../../domain/effort-label.ts"
import { modelLabel } from "./model-label.ts"
import { useModelPermission } from "./model-permission.ts"

export function RunSettingChip(props: { readonly className: string }): ReactElement {
  const control = useModelPermission()
  const { effort } = control
  const model = modelLabel(control.model)
  const text = effort.kind === "known" ? `${model}・${effortLabel(effort.value)}` : model
  return (
    <span className={props.className} title="モデルと考える深さ">
      {text}
    </span>
  )
}
