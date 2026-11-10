// 字の段・色・太さだけを表す variant 部品。中身は Astryx の `Text`。
// 文字の組み（1行で切る・字間・桁揃え・書体）と margin は呼び出し側が `className` で渡す。

import { Text as AstryxText, type TextType } from "@astryxdesign/core/Text"
import type { ReactElement, ReactNode } from "react"

import styles from "./text.module.css"

type TextElement = "p" | "span" | "summary"
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

/** 字の段は Astryx の `type` の段へ落ちる。`label` と `action` は同じ段になる。 */
const TEXT_TYPE = {
  label: "supporting",
  action: "supporting",
  secondary: "supporting",
  subheading: "label",
  body: "body",
  heading: "large",
  inherit: "inherit",
} satisfies Record<TextSize, TextType>

export const TEXT_COLOR = {
  ink: "primary",
  "ink-quiet": "disabled",
  accent: "accent",
  "state-ok": "state-ok",
  "state-warn": "state-warn",
  "state-ng": "state-ng",
  "state-ask": "state-ask",
  inherit: "inherit",
} as const satisfies Record<TextTone, string>

/** `inherit` は Astryx に口が無く、字の段の既定の太さになる。 */
export const TEXT_WEIGHT = {
  normal: "normal",
  semibold: "semibold",
  bold: "bold",
  inherit: undefined,
} as const satisfies Record<TextWeight, string | undefined>

export function Text(props: TextProps): ReactElement {
  const text = (
    <AstryxText
      as={props.element === "summary" ? "span" : props.element}
      type={TEXT_TYPE[props.size]}
      color={TEXT_COLOR[props.tone]}
      weight={TEXT_WEIGHT[props.weight]}
      display={props.element === "p" ? "block" : "inline"}
      className={props.element === "summary" ? undefined : props.className}
    >
      {props.children}
    </AstryxText>
  )
  // Astryx の `Text` は `summary` を描けないので、`summary` が字を持たず中の `Text` が描く。
  return props.element === "summary" ? <summary className={props.className}>{text}</summary> : text
}
