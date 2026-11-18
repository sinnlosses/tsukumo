// 面の末尾のお願いの欄。選択肢の札を押せるのは最新のやり取りの最終レポートだけ。

import type { ReactElement, RefCallback } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { favorOptionsOf } from "../domain/favor-option-list.ts"
import { FavorRegion } from "./report-head-region.tsx"

export function FavorFollowUp(props: {
  readonly favor: { readonly id: string; readonly text: string }
  readonly components: readonly A2uiReportComponent[]
  readonly favorRef?: RefCallback<HTMLElement>
  readonly pressable: boolean
}): ReactElement {
  return (
    <FavorRegion
      id={props.favor.id}
      text={props.favor.text}
      favorRef={props.favorRef}
      options={favorOptionsOf(props.components)}
      pressable={props.pressable}
    />
  )
}
