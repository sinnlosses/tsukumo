// 小さな印の部品。持つのは顔（字の色・地・角丸）だけで、置き方は呼び出し側が `className` で渡す。
// 色だけで意味を伝えないため、`children` には意味を言う語を必ず入れる。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import styles from "./badge.module.css"

type BadgeTone = "neutral" | "ok" | "warn" | "ng" | "accent"
type BadgeShape = "pill" | "square"

export type BadgeProps = {
  readonly tone: BadgeTone
  readonly shape: BadgeShape
  /** 置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const TONE_CLASS = {
  neutral: styles["badge-tone-neutral"],
  ok: styles["badge-tone-ok"],
  warn: styles["badge-tone-warn"],
  ng: styles["badge-tone-ng"],
  accent: styles["badge-tone-accent"],
} satisfies Record<BadgeTone, string>

const SHAPE_CLASS = {
  pill: styles["badge-shape-pill"],
  square: styles["badge-shape-square"],
} satisfies Record<BadgeShape, string>

export function Badge(props: BadgeProps): ReactElement {
  const className = clsx(
    styles["badge"],
    TONE_CLASS[props.tone],
    SHAPE_CLASS[props.shape],
    props.className,
  )
  return (
    <span className={className} data-tone={props.tone} data-shape={props.shape}>
      {props.children}
    </span>
  )
}
