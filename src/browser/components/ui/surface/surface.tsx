// 箱の顔（地・枠・角丸・内側の余白・影）を寄せる部品。
// 置き方（margin・flex・align-self など）は呼び出し側が `className` で渡す。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import styles from "./surface.module.css"

type SurfaceElement = "div" | "section"
type SurfaceTone = "surface" | "raised" | "accent"
type SurfaceSpace = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
type SurfaceRadius = "sm" | "md" | "lg" | "xl"
type SurfaceShadow = "none" | "raised" | "overlay"

export type SurfaceProps = {
  readonly element: SurfaceElement
  readonly tone: SurfaceTone
  /** 内側の余白。 */
  readonly space: SurfaceSpace
  readonly radius: SurfaceRadius
  readonly shadow: SurfaceShadow
  /** 置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const TONE_CLASS = {
  surface: styles["surface-tone-surface"],
  raised: styles["surface-tone-raised"],
  accent: styles["surface-tone-accent"],
} satisfies Record<SurfaceTone, string>

const SPACE_CLASS = {
  none: styles["surface-space-none"],
  xs: styles["surface-space-xs"],
  sm: styles["surface-space-sm"],
  md: styles["surface-space-md"],
  lg: styles["surface-space-lg"],
  xl: styles["surface-space-xl"],
  "2xl": styles["surface-space-2xl"],
} satisfies Record<SurfaceSpace, string>

const RADIUS_CLASS = {
  sm: styles["surface-radius-sm"],
  md: styles["surface-radius-md"],
  lg: styles["surface-radius-lg"],
  xl: styles["surface-radius-xl"],
} satisfies Record<SurfaceRadius, string>

const SHADOW_CLASS = {
  none: styles["surface-shadow-none"],
  raised: styles["surface-shadow-raised"],
  overlay: styles["surface-shadow-overlay"],
} satisfies Record<SurfaceShadow, string>

export function Surface(props: SurfaceProps): ReactElement {
  const className = clsx(
    styles["surface"],
    TONE_CLASS[props.tone],
    SPACE_CLASS[props.space],
    RADIUS_CLASS[props.radius],
    SHADOW_CLASS[props.shadow],
    props.className,
  )
  if (props.element === "section") {
    return <section className={className}>{props.children}</section>
  }
  return <div className={className}>{props.children}</div>
}
