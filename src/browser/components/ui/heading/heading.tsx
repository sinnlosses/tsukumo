// 見出しの部品。中身は Astryx の `Heading`。
// 字の段は `level` が決め、`size` の区別は持たない（props には残す）。色・太さの対応表は `Text` のものを読む。

import { Heading as AstryxHeading } from "@astryxdesign/core/Text"
import type { ReactElement, ReactNode } from "react"

import {
  TEXT_COLOR,
  TEXT_WEIGHT,
  type TextSize,
  type TextTone,
  type TextWeight,
} from "../text/text.tsx"

type HeadingLevel = 1 | 2 | 3 | 4
type HeadingSize = Exclude<TextSize, "inherit">
type HeadingTone = TextTone
type HeadingWeight = Exclude<TextWeight, "inherit">

export type HeadingProps = {
  readonly level: HeadingLevel
  readonly size: HeadingSize
  readonly tone: HeadingTone
  readonly weight: HeadingWeight
  /** 置き方（margin など）と、語彙に無い見た目（字間など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

export function Heading(props: HeadingProps): ReactElement {
  return (
    <AstryxHeading
      level={props.level}
      color={TEXT_COLOR[props.tone]}
      weight={TEXT_WEIGHT[props.weight]}
      className={props.className}
    >
      {props.children}
    </AstryxHeading>
  )
}
