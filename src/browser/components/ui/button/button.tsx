// ボタンの部品。持つのは顔（枠・地・字の色と hover・focus-visible・押せないとき・押されたとき）だけで、箱（高さ・余白・角丸）は呼び出し側が `className` で渡す。
//
// 押せないは `aria-disabled` の1通り（`disabled` を使わない。フォーカスは残るので `title` の理由が読める）。
// 押されても `onClick` を呼ばない。

import clsx from "clsx"
import type { ReactElement, ReactNode, Ref } from "react"

import { TEXT_SIZE_CLASS, type TextSize } from "../text/text.tsx"
import styles from "./button.module.css"

export type ButtonType = "button" | "submit"
export type ButtonVariant =
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
  | "ghost"
  | "ghost-hover-accent"
  | "ghost-hover-outline"
  | "link"
  | "text-accent"
  | "text-ink-hover-underline"
export type ButtonSize = Exclude<TextSize, "heading" | "inherit">
/** トグルボタンの押された状態。`"none"` は `aria-pressed` を付けない（トグルボタンではない）。 */
export type ButtonPressed = "none" | "on" | "off"
/**
 * 押すと開く面との関係。
 * `expander` は `aria-expanded` だけを付け、`popover` は開く面の id（`aria-controls`）と、Esc で戻る先として DOM を預ける `ref` も付ける。
 */
export type ButtonDisclosure =
  | { readonly kind: "none" }
  | { readonly kind: "expander"; readonly expanded: boolean }
  | {
      readonly kind: "popover"
      readonly ref: Ref<HTMLButtonElement>
      readonly expanded: boolean
      readonly controls: string
    }

export type ButtonProps = {
  readonly type: ButtonType
  readonly variant: ButtonVariant
  readonly size: ButtonSize
  readonly pressed: ButtonPressed
  readonly disabled: boolean
  /** 見える字がそのままアクセシブルネームになるときは `undefined`（`×` だけの札などで使う）。 */
  readonly ariaLabel: string | undefined
  /** 押すと開く面の種類（サイドバーの区画の見出しの「一覧を見る」など）。無ければ `undefined`。 */
  readonly ariaHasPopup: "dialog" | undefined
  readonly disclosure: ButtonDisclosure
  /** `disabled` の理由など、hover で読ませたい1行。無ければ `undefined`。 */
  readonly title: string | undefined
  /** 置き方（margin など）と箱（高さ・余白・角丸）だけを渡す。 */
  readonly className: string
  readonly onClick: () => void
  readonly children: ReactNode
}

export const BUTTON_VARIANT_CLASS = {
  outline: styles["button-variant-outline"],
  "outline-dashed": styles["button-variant-outline-dashed"],
  "outline-hover-warn": styles["button-variant-outline-hover-warn"],
  "outline-hover-danger": styles["button-variant-outline-hover-danger"],
  "outline-accent": styles["button-variant-outline-accent"],
  "outline-accent-tinted": styles["button-variant-outline-accent-tinted"],
  "tinted-accent": styles["button-variant-tinted-accent"],
  "outline-warn": styles["button-variant-outline-warn"],
  "outline-ground": styles["button-variant-outline-ground"],
  "outline-surface": styles["button-variant-outline-surface"],
  "outline-faint-ground": styles["button-variant-outline-faint-ground"],
  "outline-ok-surface": styles["button-variant-outline-ok-surface"],
  "outline-danger-surface": styles["button-variant-outline-danger-surface"],
  "outline-soft-danger": styles["button-variant-outline-soft-danger"],
  "outline-soft-danger-veil": styles["button-variant-outline-soft-danger-veil"],
  "outline-dashed-accent-ink": styles["button-variant-outline-dashed-accent-ink"],
  "solid-accent": styles["button-variant-solid-accent"],
  "solid-accent-static": styles["button-variant-solid-accent-static"],
  "solid-danger": styles["button-variant-solid-danger"],
  "solid-warn": styles["button-variant-solid-warn"],
  ghost: styles["button-variant-ghost"],
  "ghost-hover-accent": styles["button-variant-ghost-hover-accent"],
  "ghost-hover-outline": styles["button-variant-ghost-hover-outline"],
  link: styles["button-variant-link"],
  "text-accent": styles["button-variant-text-accent"],
  "text-ink-hover-underline": styles["button-variant-text-ink-hover-underline"],
} satisfies Record<ButtonVariant, string>

const BUTTON_PRESSED_ARIA = {
  none: undefined,
  on: "true",
  off: "false",
} satisfies Record<ButtonPressed, "true" | "false" | undefined>

export function Button(props: ButtonProps): ReactElement {
  const className = clsx(
    styles["button"],
    BUTTON_VARIANT_CLASS[props.variant],
    TEXT_SIZE_CLASS[props.size],
    props.className,
  )

  const handleClick = (): void => {
    // `aria-disabled` は native の `disabled` と違いクリックを止めないので、ここで読み替える。
    if (props.disabled) {
      return
    }
    props.onClick()
  }

  const { disclosure } = props

  return (
    <button
      type={props.type}
      ref={disclosure.kind === "popover" ? disclosure.ref : undefined}
      className={className}
      aria-pressed={BUTTON_PRESSED_ARIA[props.pressed]}
      aria-disabled={props.disabled}
      aria-label={props.ariaLabel}
      aria-haspopup={props.ariaHasPopup}
      aria-expanded={disclosure.kind === "none" ? undefined : disclosure.expanded}
      aria-controls={disclosure.kind === "popover" ? disclosure.controls : undefined}
      title={props.title}
      onClick={handleClick}
    >
      {props.children}
    </button>
  )
}
