// 見出しを押して開閉する箱を描く部品。中身は Astryx の `Collapsible`。
// 開く側の字は本文の段（`--font-body`）にそろえる。

import { Collapsible as AstryxCollapsible } from "@astryxdesign/core/Collapsible"
import type { ReactElement, ReactNode } from "react"

import styles from "./collapsible.module.css"

/** 開閉を部品に任せる形（defaultOpen）か、呼ぶ側が持つ形（isOpen と onOpenChange）か。 */
type CollapsibleOpenProps =
  | {
      /** 最初から開いているか。 */
      readonly defaultOpen: boolean
      readonly isOpen?: never
      readonly onOpenChange?: never
    }
  | {
      readonly defaultOpen?: never
      /** 開いているか。呼ぶ側が持つ。 */
      readonly isOpen: boolean
      /** 見出しを押して開閉が変わるときに呼ばれる。 */
      readonly onOpenChange: (open: boolean) => void
    }

export type CollapsibleProps = CollapsibleOpenProps & {
  readonly trigger: ReactNode
  /** 山形の印を見出しの字の前（start）に置くか、右端（end）に置くか。 */
  readonly chevronPosition: "start" | "end"
  /** 見出しと中の字の段。省くと本文の段（`--font-body`）、label は手順の行の段（`--font-label`）。 */
  readonly textSize?: "body" | "label"
  readonly children: ReactNode
}

export function Collapsible(props: CollapsibleProps): ReactElement {
  const openProps =
    props.isOpen === undefined
      ? { defaultIsOpen: props.defaultOpen }
      : { isOpen: props.isOpen, onOpenChange: props.onOpenChange }
  return (
    <AstryxCollapsible
      trigger={
        <span className={styles["trigger"]} data-text-size={props.textSize}>
          {props.trigger}
        </span>
      }
      {...openProps}
      chevronPosition={props.chevronPosition}
    >
      <div className={styles["body"]} data-text-size={props.textSize}>
        {props.children}
      </div>
    </AstryxCollapsible>
  )
}
