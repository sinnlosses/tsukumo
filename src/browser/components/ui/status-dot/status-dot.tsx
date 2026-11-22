// 状態を色で示す小さな点。中身は Astryx の `StatusDot` で、読み上げの名前は `label`。動かさない。
// 色だけで意味を伝えないため、点のそばに状態を言う字か読み上げの名前を必ず置く。

import { StatusDot as AstryxStatusDot, type StatusDotVariant } from "@astryxdesign/core/StatusDot"
import type { ReactElement } from "react"

type StatusDotTone = "accent" | "ok" | "ng" | "neutral"

export type StatusDotProps = {
  readonly tone: StatusDotTone
  readonly label: string
}

const TONE_VARIANT = {
  accent: "accent",
  ok: "success",
  ng: "error",
  neutral: "neutral",
} satisfies Record<StatusDotTone, StatusDotVariant>

export function StatusDot(props: StatusDotProps): ReactElement {
  return <AstryxStatusDot variant={TONE_VARIANT[props.tone]} label={props.label} />
}
