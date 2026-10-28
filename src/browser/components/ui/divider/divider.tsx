// 罫の部品。持つのは線の濃さ（`tone`）と向きだけで、置き方は呼び出し側が `className` で渡す。

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

const TONE_CLASS = {
  strong: styles["divider-tone-strong"],
  soft: styles["divider-tone-soft"],
  quiet: styles["divider-tone-quiet"],
} satisfies Record<DividerTone, string>

const ORIENTATION_CLASS = {
  horizontal: styles["divider-orientation-horizontal"],
  vertical: styles["divider-orientation-vertical"],
} satisfies Record<DividerOrientation, string>

export function Divider(props: DividerProps): ReactElement {
  const className = clsx(
    styles["divider"],
    TONE_CLASS[props.tone],
    ORIENTATION_CLASS[props.orientation],
    props.className,
  )
  return (
    <hr
      className={className}
      data-tone={props.tone}
      aria-orientation={props.orientation === "vertical" ? "vertical" : undefined}
    />
  )
}
