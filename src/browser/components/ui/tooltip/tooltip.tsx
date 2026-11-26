// ホバーかフォーカスで、口になる要素のそばに短い一行を出す部品。中身は Astryx の `Tooltip`。
// 出るまでの遅さは Astryx の既定に任せる。

import { Tooltip as AstryxTooltip } from "@astryxdesign/core/Tooltip"
import type { ReactElement, ReactNode } from "react"

export type TooltipProps = {
  /** 出す中身。短く、押せない内容にする。 */
  readonly content: ReactNode
  /** 口から見てどちらに出すか。 */
  readonly placement: "above" | "below"
  /** false のあいだはホバーとフォーカスで出さない。 */
  readonly isEnabled?: boolean
  /** 出る・消えるたびに呼ばれる。 */
  readonly onOpenChange?: (open: boolean) => void
  /** 口になる要素。 */
  readonly children: ReactNode
}

export function Tooltip(props: TooltipProps): ReactElement {
  return (
    <AstryxTooltip
      content={props.content}
      placement={props.placement}
      isEnabled={props.isEnabled}
      onOpenChange={props.onOpenChange}
    >
      {props.children}
    </AstryxTooltip>
  )
}
