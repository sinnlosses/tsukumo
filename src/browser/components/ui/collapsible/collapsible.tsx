// 見出しを押して開閉する箱を描く部品。中身は Astryx の `Collapsible`。
// 開く側の字は本文の段（`--font-body`）にそろえる。

import { Collapsible as AstryxCollapsible } from "@astryxdesign/core/Collapsible"
import type { ReactElement, ReactNode } from "react"

import styles from "./collapsible.module.css"

export type CollapsibleProps = {
  readonly trigger: ReactNode
  /** 最初から開いているか。 */
  readonly defaultOpen: boolean
  /** 山形の印を見出しの字の前（start）に置くか、右端（end）に置くか。 */
  readonly chevronPosition: "start" | "end"
  /** 見出しと中の字の段。省くと本文の段（`--font-body`）、label は手順の行の段（`--font-label`）。 */
  readonly textSize?: "body" | "label"
  readonly children: ReactNode
}

export function Collapsible(props: CollapsibleProps): ReactElement {
  return (
    <AstryxCollapsible
      trigger={
        <span className={styles["trigger"]} data-text-size={props.textSize}>
          {props.trigger}
        </span>
      }
      defaultIsOpen={props.defaultOpen}
      chevronPosition={props.chevronPosition}
    >
      <div className={styles["body"]} data-text-size={props.textSize}>
        {props.children}
      </div>
    </AstryxCollapsible>
  )
}
