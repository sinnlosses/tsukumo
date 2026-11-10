// ボタンの部品。中身は Astryx の `Button`（押された状態を持つときは `ToggleButton`）で、顔は Astryx の variant に写して決める。
// 箱の置き方は呼び出し側が `className` で渡す。
//
// 押せないは `aria-disabled` の1通り（`disabled` を使わない。フォーカスは残るので `title` の理由が読める）。
// 押されても `onClick` を呼ばない。

import {
  Button as AstryxButton,
  type ButtonVariant as AstryxVariant,
} from "@astryxdesign/core/Button"
import { ToggleButton } from "@astryxdesign/core/ToggleButton"
import clsx from "clsx"
import { isValidElement, type ReactElement, type ReactNode, type Ref } from "react"

import type { TextSize } from "../text/text.tsx"
import styles from "./button.module.css"

type ButtonVariant =
  | "outline"
  | "outline-dashed"
  | "outline-hover-warn"
  | "outline-hover-danger"
  | "outline-accent"
  | "outline-accent-tinted"
  | "tinted-accent"
  | "outline-warn"
  | "outline-ground"
  | "outline-surface"
  | "outline-faint-ground"
  | "outline-ok-surface"
  | "outline-danger-surface"
  | "outline-soft-danger"
  | "outline-soft-danger-veil"
  | "outline-dashed-accent-ink"
  | "solid-accent"
  | "solid-accent-static"
  | "solid-danger"
  | "solid-warn"
  | "solid-ink"
  | "ghost"
  | "ghost-hover-accent"
  | "ghost-hover-outline"
  | "ghost-hover-rule-soft"
  | "link"
  | "text-accent"
type ButtonSize = Exclude<TextSize, "heading" | "inherit">
/** トグルボタンの押された状態。`"none"` は `aria-pressed` を付けない（トグルボタンではない）。 */
type ButtonPressed = "none" | "on" | "off"
/**
 * 押すと開く面との関係。
 * `dialog` は `aria-haspopup="dialog"` だけを付け（開閉の状態は持たない）、
 * `expander` は `aria-expanded` だけを付け、`popover` は（`popup` が `"menu"` のとき `aria-haspopup="menu"` と）開く面の id（`aria-controls`）と、Esc で戻る先として DOM を預ける `ref` も付ける。
 */
type ButtonDisclosure =
  | { readonly kind: "none" }
  | { readonly kind: "dialog" }
  | { readonly kind: "expander"; readonly expanded: boolean }
  | {
      readonly kind: "popover"
      /** 開く面がメニューなら `"menu"`（`aria-haspopup="menu"` を付ける）。そうでなければ `"none"`。 */
      readonly popup: "menu" | "none"
      readonly ref: Ref<HTMLButtonElement>
      readonly expanded: boolean
      readonly controls: string
    }

export type ButtonProps = {
  readonly variant: ButtonVariant
  readonly size: ButtonSize
  readonly pressed: ButtonPressed
  readonly disabled: boolean
  /** 見える字がそのままアクセシブルネームになるときは省略する（`×` だけの札などで使う）。 */
  readonly ariaLabel?: string
  readonly disclosure: ButtonDisclosure
  /** `disabled` の理由など、hover で読ませたい1行。省略すると付けない。 */
  readonly title?: string
  /** 置き方（margin など）と箱（高さ・余白・角丸）だけを渡す。 */
  readonly className: string
  readonly onClick: () => void
  readonly children: ReactNode
}

/** 27 の語は Astryx の 4 つと、テーマで足した `warning` に落ちる。枠の点線・hover の色・地の違いは落とす。 */
const ASTRYX_VARIANT = {
  outline: "secondary",
  "outline-dashed": "secondary",
  "outline-hover-warn": "secondary",
  "outline-hover-danger": "destructive",
  "outline-accent": "secondary",
  "outline-accent-tinted": "secondary",
  "tinted-accent": "secondary",
  "outline-warn": "warning",
  "outline-ground": "secondary",
  "outline-surface": "secondary",
  "outline-faint-ground": "secondary",
  "outline-ok-surface": "secondary",
  "outline-danger-surface": "destructive",
  "outline-soft-danger": "destructive",
  "outline-soft-danger-veil": "destructive",
  "outline-dashed-accent-ink": "secondary",
  "solid-accent": "primary",
  "solid-accent-static": "primary",
  "solid-danger": "destructive",
  "solid-warn": "warning",
  "solid-ink": "primary",
  ghost: "ghost",
  "ghost-hover-accent": "ghost",
  "ghost-hover-outline": "ghost",
  "ghost-hover-rule-soft": "ghost",
  link: "ghost",
  "text-accent": "ghost",
} satisfies Record<ButtonVariant, AstryxVariant>

const ASTRYX_SIZE = {
  label: "sm",
  action: "sm",
  secondary: "sm",
  subheading: "md",
  body: "lg",
} as const satisfies Record<ButtonSize, "sm" | "md" | "lg">

export function Button(props: ButtonProps): ReactElement {
  const handleClick = (): void => {
    // `aria-disabled` は native の `disabled` と違いクリックを止めないので、ここで読み替える。
    if (props.disabled) {
      return
    }
    props.onClick()
  }

  const { disclosure } = props
  const common = {
    ref: disclosure.kind === "popover" ? disclosure.ref : undefined,
    label: props.ariaLabel ?? visibleText(props.children),
    size: ASTRYX_SIZE[props.size],
    className: clsx(styles.button, props.className),
    "aria-disabled": props.disabled,
    "aria-haspopup": popupOf(disclosure),
    "aria-expanded":
      disclosure.kind === "expander" || disclosure.kind === "popover"
        ? disclosure.expanded
        : undefined,
    "aria-controls": disclosure.kind === "popover" ? disclosure.controls : undefined,
    title: props.title,
    onClick: handleClick,
    children: props.children,
  }

  if (props.pressed === "none") {
    return <AstryxButton {...common} variant={ASTRYX_VARIANT[props.variant]} type="button" />
  }
  return <ToggleButton {...common} isPressed={props.pressed === "on"} />
}

/**
 * 見える字（`aria-hidden` の枝は除く）を集める。Astryx の `label` がアクセシブルネームになるため。
 * 中の要素は行内（`span` など）として前後の字へそのままつなぎ、連なる空白は1つに畳む。
 */
function visibleText(node: ReactNode): string {
  return wordsOf(node).replaceAll(/\s+/g, " ").trim()
}

function wordsOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(wordsOf).join("")
  }
  if (isValidElement<{ children?: ReactNode; "aria-hidden"?: unknown }>(node)) {
    return node.props["aria-hidden"] === undefined || node.props["aria-hidden"] === false
      ? wordsOf(node.props.children)
      : ""
  }
  return ""
}

function popupOf(disclosure: ButtonDisclosure): "dialog" | "menu" | undefined {
  switch (disclosure.kind) {
    case "dialog":
      return "dialog"
    case "popover":
      return disclosure.popup === "menu" ? "menu" : undefined
    case "none":
    case "expander":
      return undefined
  }
}
