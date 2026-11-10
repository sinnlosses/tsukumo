// 画面には出さず、読み上げにだけ伝える部品。Astryx の `VisuallyHidden` で描く。
// 読み上げの領域（`role="status"`）にするときは `role`・`aria-live` を渡す。

import { VisuallyHidden as AstryxVisuallyHidden } from "@astryxdesign/core/VisuallyHidden"
import type { ReactElement, ReactNode } from "react"

type VisuallyHiddenElement = "div" | "p" | "span"

export type VisuallyHiddenProps = {
  readonly element: VisuallyHiddenElement
  /** 読み上げの領域にするなら `"status"`。 */
  readonly role?: "status"
  readonly "aria-live"?: "polite"
  readonly "aria-atomic"?: "true" | "false"
  readonly "data-live-announcer"?: string
  readonly children: ReactNode
}

export function VisuallyHidden(props: VisuallyHiddenProps): ReactElement {
  return (
    <AstryxVisuallyHidden
      as={props.element}
      role={props.role}
      aria-live={props["aria-live"]}
      aria-atomic={props["aria-atomic"]}
      data-live-announcer={props["data-live-announcer"]}
    >
      {props.children}
    </AstryxVisuallyHidden>
  )
}
