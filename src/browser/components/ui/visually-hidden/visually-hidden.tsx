// 画面には出さず、読み上げにだけ伝える部品。読み上げの領域（`role="status"`）にするときは `role`・`aria-live` を渡す。

import type { ReactElement, ReactNode } from "react"

import styles from "./visually-hidden.module.css"

type VisuallyHiddenElement = "div" | "p" | "span"

export type VisuallyHiddenProps = {
  readonly element: VisuallyHiddenElement
  /** 読み上げの領域にするなら `"status"`。 */
  readonly role: "status" | undefined
  readonly "aria-live": "polite" | undefined
  readonly "aria-atomic": "true" | "false" | undefined
  readonly "data-live-announcer": string | undefined
  readonly children: ReactNode
}

export function VisuallyHidden(props: VisuallyHiddenProps): ReactElement {
  const Element = props.element
  return (
    <Element
      role={props.role}
      aria-live={props["aria-live"]}
      aria-atomic={props["aria-atomic"]}
      data-live-announcer={props["data-live-announcer"]}
      className={styles["visually-hidden"]}
    >
      {props.children}
    </Element>
  )
}
