// 並べるための variant 部品。Astryx の `Stack` で描き、Astryx に無い値（`baseline` の揃え）だけ class で足す。
// 寸法・枠・地・置き方（margin・flex・align-self など）は呼び出し側が `className` で渡す。
//
// Astryx の props への写し方は `astryxStackProps` の1か所に置く。
// `Stack` を直に使うのは、向きを値で切り替える箇所だけ。向きの決まった並べは `VStack`・`HStack` で書く。

import { Stack as AstryxStack, type StackProps as AstryxStackProps } from "@astryxdesign/core/Stack"
import clsx from "clsx"
import type { ReactElement, ReactNode, Ref } from "react"

import styles from "./stack.module.css"

type StackElement = "div" | "section" | "span" | "header" | "footer" | "label" | "p"
/** アクセシブルネームの付け方。付けないか、見える文字列を渡すか、見出しなど別の要素の id を指すか。 */
type StackName =
  | { readonly kind: "none" }
  | { readonly kind: "label"; readonly label: string }
  | { readonly kind: "labelledby"; readonly id: string }
type StackDirection = "row" | "column"
type StackGap = "none" | "xs" | "sm" | "md" | "lg" | "xl"
type StackAlign = "start" | "center" | "end" | "baseline" | "stretch"
type StackJustify = "start" | "center" | "end" | "between"
type StackWrap = "nowrap" | "wrap"

export type StackProps = {
  readonly element: StackElement
  readonly name: StackName
  /** 描いた要素を外から読む（転がし位置など）。読まないなら省略する。 */
  readonly ref?: Ref<HTMLElement>
  readonly direction: StackDirection
  readonly gap: StackGap
  readonly align: StackAlign
  readonly justify: StackJustify
  readonly wrap: StackWrap
  /** 箱の見た目（余白・枠・地）と置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

type AstryxStackShared = Pick<
  AstryxStackProps,
  | "as"
  | "ref"
  | "gap"
  | "align"
  | "justify"
  | "wrap"
  | "className"
  | "aria-label"
  | "aria-labelledby"
>

const STACK_DIRECTION_PROP = {
  row: "horizontal",
  column: "vertical",
} satisfies Record<StackDirection, NonNullable<AstryxStackProps["direction"]>>

const STACK_GAP_PROP = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
} satisfies Record<StackGap, NonNullable<AstryxStackProps["gap"]>>

export function Stack(props: StackProps): ReactElement {
  return (
    <AstryxStack {...astryxStackProps(props)} direction={STACK_DIRECTION_PROP[props.direction]}>
      {props.children}
    </AstryxStack>
  )
}

export function astryxStackProps(
  props: Omit<StackProps, "direction" | "children">,
): AstryxStackShared {
  return {
    as: props.element,
    ref: props.ref,
    gap: STACK_GAP_PROP[props.gap],
    align: props.align === "baseline" ? undefined : props.align,
    justify: props.justify,
    wrap: props.wrap,
    className: clsx(props.align === "baseline" && styles["stack-align-baseline"], props.className),
    "aria-label": props.name.kind === "label" ? props.name.label : undefined,
    "aria-labelledby": props.name.kind === "labelledby" ? props.name.id : undefined,
  }
}
