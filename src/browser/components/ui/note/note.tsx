// 注記（種類の題と本文）を描く部品。中身は Astryx の `Banner`。
// 本文は常に開いたままで、閉じるボタンも畳むボタンも出さない。

import { Banner, type BannerStatus } from "@astryxdesign/core/Banner"
import type { ReactElement, ReactNode } from "react"

export type NoteTone = "info" | "warn" | "ng" | "ask"

export type NoteProps = {
  readonly tone: NoteTone
  /** 種類の名前。 */
  readonly title: string
  readonly children: ReactNode
}

const TONE_STATUS = {
  info: "info",
  warn: "warning",
  ng: "error",
  ask: "ask",
} as const satisfies Record<NoteTone, BannerStatus>

export function Note(props: NoteProps): ReactElement {
  return (
    <Banner status={TONE_STATUS[props.tone]} title={props.title} collapsible={false}>
      {props.children}
    </Banner>
  )
}
