// 見出しの部品（`docs/design.md` 2章「`components/ui/` の部品（variant の作法と一覧）」
// 「Text と Heading の境目」）。**持つのは見出しの見た目だけ**——字の段・色・太さの対応表は
// `ui/text/` の1つを読み、二重に持たない。`Text` との違いは要素が `<h1>`〜`<h4>` になることと、
// `margin: 0` を既定に持つことだけ（見出しの意味〔`level`〕と見た目〔`size`〕は別の props）。

import { type ReactElement, type ReactNode } from "react"

import {
  TEXT_SIZE_CLASS,
  TEXT_TONE_CLASS,
  TEXT_WEIGHT_CLASS,
  type TextSize,
  type TextTone,
  type TextWeight,
} from "../text/text.tsx"
import styles from "./heading.module.css"

export type HeadingLevel = 1 | 2 | 3 | 4
export type HeadingSize = Exclude<TextSize, "inherit">
export type HeadingTone = TextTone
export type HeadingWeight = Exclude<TextWeight, "inherit">

export type HeadingProps = {
  readonly level: HeadingLevel
  readonly size: HeadingSize
  readonly tone: HeadingTone
  readonly weight: HeadingWeight
  /** 置き方（margin など）と、語彙に無い見た目（字間など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const HEADING_ELEMENT = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
} as const satisfies Record<HeadingLevel, "h1" | "h2" | "h3" | "h4">

export function Heading(props: HeadingProps): ReactElement {
  const className = [
    styles["heading"],
    TEXT_SIZE_CLASS[props.size],
    TEXT_TONE_CLASS[props.tone],
    TEXT_WEIGHT_CLASS[props.weight],
    props.className,
  ]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" ")

  const Element = HEADING_ELEMENT[props.level]
  return <Element className={className}>{props.children}</Element>
}
