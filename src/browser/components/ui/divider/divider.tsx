// 罫の部品。Astryx の `Divider` で描く。持つのは線の濃さ（`tone`）と向きだけで、置き方は呼び出し側が `className` で渡す。

import { Divider as AstryxDivider, type DividerVariant } from "@astryxdesign/core/Divider"
import clsx from "clsx"
import type { ReactElement } from "react"

import styles from "./divider.module.css"

type DividerTone = "strong" | "soft" | "quiet"
type DividerOrientation = "horizontal" | "vertical"

export type DividerProps = {
  readonly tone: DividerTone
  readonly orientation: DividerOrientation
  /** 置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
}

const DIVIDER_VARIANT_PROP = {
  strong: "strong",
  soft: "subtle",
  quiet: "subtle",
} satisfies Record<DividerTone, DividerVariant>

export function Divider(props: DividerProps): ReactElement {
  return (
    <AstryxDivider
      variant={DIVIDER_VARIANT_PROP[props.tone]}
      orientation={props.orientation}
      data-tone={props.tone}
      className={clsx(
        styles["divider"],
        props.orientation === "vertical" && styles["divider-orientation-vertical"],
        props.className,
      )}
    />
  )
}
