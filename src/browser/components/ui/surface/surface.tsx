// 箱の顔（地・枠・角丸・内側の余白・影）を寄せる部品。中身は Astryx の `Card`。
// 置き方（margin・flex・align-self など）は呼び出し側が `className` で渡す。

import { Card, type CardProps, type CardVariant } from "@astryxdesign/core/Card"
import type { ReactElement, ReactNode } from "react"

type SpacingStep = NonNullable<CardProps["padding"]>
type Elevation = NonNullable<CardProps["elevation"]>

type SurfaceElement = "div" | "section"
type SurfaceTone = "surface" | "raised" | "accent"
type SurfaceSpace = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
type SurfaceRadius = "sm" | "md" | "lg" | "xl"
type SurfaceShadow = "none" | "raised" | "overlay"

export type SurfaceProps = {
  /** `Card` は `div` だけを描くので、見た目には使わない。 */
  readonly element: SurfaceElement
  readonly tone: SurfaceTone
  /** 内側の余白。 */
  readonly space: SurfaceSpace
  /** `Card` の角丸は一段なので、見た目には使わない。 */
  readonly radius: SurfaceRadius
  readonly shadow: SurfaceShadow
  /** 置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

// `raised` の地は `Card` に口が無い見た目の段なので `default` に寄せる。
const TONE_VARIANT = {
  surface: "default",
  raised: "default",
  accent: "accent",
} satisfies Record<SurfaceTone, CardVariant>

const SPACE_PADDING = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
  "2xl": 6,
} satisfies Record<SurfaceSpace, SpacingStep>

const SHADOW_ELEVATION = {
  none: "none",
  raised: "med",
  overlay: "high",
} satisfies Record<SurfaceShadow, Elevation>

export function Surface(props: SurfaceProps): ReactElement {
  return (
    <Card
      variant={TONE_VARIANT[props.tone]}
      padding={SPACE_PADDING[props.space]}
      elevation={SHADOW_ELEVATION[props.shadow]}
      className={props.className}
    >
      {props.children}
    </Card>
  )
}
