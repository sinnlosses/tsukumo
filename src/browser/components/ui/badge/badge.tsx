// 小さな印の部品。中身は Astryx の `Badge` で、色は variant に写して決める。置き方は呼び出し側が `className` で渡す。
// 色だけで意味を伝えないため、`children` には意味を言う語を必ず入れる。

import { Badge as AstryxBadge, type BadgeVariant } from "@astryxdesign/core/Badge"
import type { ReactElement, ReactNode } from "react"

type BadgeTone = "neutral" | "ok" | "warn" | "ng" | "accent"
type BadgeShape = "pill" | "square"

export type BadgeProps = {
  readonly tone: BadgeTone
  /** Astryx の `Badge` に形の口が無いので、見た目には使わない。`data-shape` に出すだけ。 */
  readonly shape: BadgeShape
  /** 置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const TONE_VARIANT = {
  neutral: "gray",
  ok: "success",
  warn: "warning",
  ng: "error",
  accent: "accent",
} satisfies Record<BadgeTone, BadgeVariant>

export function Badge(props: BadgeProps): ReactElement {
  return (
    <AstryxBadge
      variant={TONE_VARIANT[props.tone]}
      label={props.children}
      className={props.className}
      data-tone={props.tone}
      data-shape={props.shape}
    />
  )
}
