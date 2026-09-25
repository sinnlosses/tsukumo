// 字の段・色・太さだけを表す variant 部品（`docs/design.md` 2章「`components/ui/` の部品
// （variant の作法と一覧）」）。**持つのは文字の見た目だけ**——文字の組み（1行で切る・字間・
// 桁揃え・書体）と margin は呼び出し側が `className` で渡す（同節「呼び出し側からの上書き
// （className）」）。
//
// **見出しの部品（`Heading`）とこの対応表を共有する**（同節「Text と Heading の境目」:
// 見出しの意味〔level〕と見た目〔size〕は別の props で、対応表は `ui/text/` に1つだけ置く）。
// `Heading` はこのファイルの `TEXT_SIZE_CLASS` / `TEXT_TONE_CLASS` / `TEXT_WEIGHT_CLASS` を
// そのまま import する。

import { type ReactElement, type ReactNode } from "react"

import styles from "./text.module.css"

export type TextElement = "p" | "span"
export type TextSize =
  | "label"
  | "action"
  | "secondary"
  | "subheading"
  | "body"
  | "heading"
  | "inherit"
export type TextTone =
  | "ink"
  | "ink-quiet"
  | "accent"
  | "state-ok"
  | "state-warn"
  | "state-ng"
  | "state-ask"
  | "inherit"
export type TextWeight = "normal" | "semibold" | "bold" | "inherit"

export type TextProps = {
  readonly element: TextElement
  readonly size: TextSize
  readonly tone: TextTone
  readonly weight: TextWeight
  /** 文字の組み（1行で切る・字間・行の高さ・桁揃え・書体）と margin だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

export const TEXT_SIZE_CLASS = {
  label: styles["text-size-label"],
  action: styles["text-size-action"],
  secondary: styles["text-size-secondary"],
  subheading: styles["text-size-subheading"],
  body: styles["text-size-body"],
  heading: styles["text-size-heading"],
  inherit: undefined,
} satisfies Record<TextSize, string | undefined>

export const TEXT_TONE_CLASS = {
  ink: styles["text-tone-ink"],
  "ink-quiet": styles["text-tone-ink-quiet"],
  accent: styles["text-tone-accent"],
  "state-ok": styles["text-tone-state-ok"],
  "state-warn": styles["text-tone-state-warn"],
  "state-ng": styles["text-tone-state-ng"],
  "state-ask": styles["text-tone-state-ask"],
  inherit: undefined,
} satisfies Record<TextTone, string | undefined>

export const TEXT_WEIGHT_CLASS = {
  normal: styles["text-weight-normal"],
  semibold: styles["text-weight-semibold"],
  bold: styles["text-weight-bold"],
  inherit: undefined,
} satisfies Record<TextWeight, string | undefined>

export function Text(props: TextProps): ReactElement {
  const className = [
    styles["text"],
    TEXT_SIZE_CLASS[props.size],
    TEXT_TONE_CLASS[props.tone],
    TEXT_WEIGHT_CLASS[props.weight],
    props.className,
  ]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" ")

  const Element = props.element
  return <Element className={className}>{props.children}</Element>
}
