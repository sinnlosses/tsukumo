// 並べるための規則（`display: flex` + 向き・間隔・揃え・折り返し）を寄せる variant 部品
// （`docs/design.md` 2章「`components/ui/` の部品（variant の作法と一覧）」）。持つのは並べる
// ことだけ——寸法・枠・地・置き方（margin・flex・align-self など）は呼び出し側が `className`
// で渡す（`docs/design.md` 同節「呼び出し側からの上書き（className）」）。
//
// 向きの決まった並べは `VStack`（縦）・`HStack`（横）で書く（`ui/v-stack/` `ui/h-stack/`）。
// `Stack` を直に使うのは、向きを値で切り替える箇所だけ。

import clsx from "clsx"
import { createElement, type ReactElement, type ReactNode, type Ref } from "react"

import styles from "./stack.module.css"

export type StackElement = "div" | "section" | "span" | "header" | "footer" | "label" | "p"
/** アクセシブルネームの付け方。付けないか、見える文字列を渡すか、見出しなど別の要素の id を指すか。 */
export type StackName =
  | { readonly kind: "none" }
  | { readonly kind: "label"; readonly label: string }
  | { readonly kind: "labelledby"; readonly id: string }
export type StackDirection = "row" | "column"
export type StackGap = "none" | "xs" | "sm" | "md" | "lg" | "xl"
export type StackAlign = "start" | "center" | "end" | "baseline" | "stretch"
export type StackJustify = "start" | "center" | "end" | "between"
export type StackWrap = "nowrap" | "wrap"

export type StackProps = {
  readonly element: StackElement
  readonly name: StackName
  /** 描いた要素を外から読む（転がし位置など）。読まないなら `undefined`。 */
  readonly ref: Ref<HTMLElement> | undefined
  readonly direction: StackDirection
  readonly gap: StackGap
  readonly align: StackAlign
  readonly justify: StackJustify
  readonly wrap: StackWrap
  /** 箱の見た目（余白・枠・地）と置き方（margin・flex・align-self など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const DIRECTION_CLASS = {
  row: styles["stack-direction-row"],
  column: styles["stack-direction-column"],
} satisfies Record<StackDirection, string | undefined>

const GAP_CLASS = {
  none: styles["stack-gap-none"],
  xs: styles["stack-gap-xs"],
  sm: styles["stack-gap-sm"],
  md: styles["stack-gap-md"],
  lg: styles["stack-gap-lg"],
  xl: styles["stack-gap-xl"],
} satisfies Record<StackGap, string | undefined>

const ALIGN_CLASS = {
  start: styles["stack-align-start"],
  center: styles["stack-align-center"],
  end: styles["stack-align-end"],
  baseline: styles["stack-align-baseline"],
  stretch: styles["stack-align-stretch"],
} satisfies Record<StackAlign, string | undefined>

const JUSTIFY_CLASS = {
  start: styles["stack-justify-start"],
  center: styles["stack-justify-center"],
  end: styles["stack-justify-end"],
  between: styles["stack-justify-between"],
} satisfies Record<StackJustify, string | undefined>

const WRAP_CLASS = {
  nowrap: styles["stack-wrap-nowrap"],
  wrap: styles["stack-wrap-wrap"],
} satisfies Record<StackWrap, string | undefined>

export function Stack(props: StackProps): ReactElement {
  const className = clsx(
    styles["stack"],
    DIRECTION_CLASS[props.direction],
    GAP_CLASS[props.gap],
    ALIGN_CLASS[props.align],
    JUSTIFY_CLASS[props.justify],
    WRAP_CLASS[props.wrap],
    props.className,
  )

  // JSX（`<Element ref={…}>`）で書くと、要素の合併型のぶん ref の型が交差になり
  // （`HTMLDivElement` と `HTMLLabelElement` と…の ref を同時に満たす）、`HTMLElement` の ref を
  // 渡せない。`createElement` は要素を `HTMLElement` として受ける。
  return createElement(
    props.element,
    {
      ref: props.ref,
      className,
      "aria-label": props.name.kind === "label" ? props.name.label : undefined,
      "aria-labelledby": props.name.kind === "labelledby" ? props.name.id : undefined,
    },
    props.children,
  )
}
