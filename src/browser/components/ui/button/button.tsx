// ボタンの部品（`docs/design.md` 2章「`components/ui/` の部品（variant の作法と一覧）」）。
// **持つのは顔（枠・地・字の色と hover・focus-visible・押せないとき・押されたとき）だけ**——箱
// （高さ・余白・角丸）は呼び出し側が `className` で渡す（同節「箱（高さ・余白・角丸）は className
// で渡す」）。
//
// **押せないは `aria-disabled` の1通り**（`disabled` を使わない。フォーカスは残るので `title` の
// 理由が読める）。押されても {@link ButtonProps.onClick} を呼ばない。
//
// `size` の対応表は `Text` と同じものを使う（`ui/text/text.tsx` の `TEXT_SIZE_CLASS`。
// 二重に持たない）。

import { type ReactElement, type ReactNode } from "react"

import { TEXT_SIZE_CLASS, type TextSize } from "../text/text.tsx"
import styles from "./button.module.css"

export type ButtonType = "button" | "submit"
export type ButtonVariant =
  | "outline"
  | "outline-accent"
  | "outline-warn"
  | "solid-accent"
  | "solid-danger"
  | "solid-warn"
  | "ghost"
  | "link"
export type ButtonSize = Exclude<TextSize, "heading" | "inherit">
/** トグルボタンの押された状態。`"none"` は `aria-pressed` を付けない（トグルボタンではない）。 */
export type ButtonPressed = "none" | "on" | "off"

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
  /** `disabled` の理由など、hover で読ませたい1行。無ければ `undefined`。 */
  readonly title: string | undefined
  /** 置き方（margin など）と箱（高さ・余白・角丸）だけを渡す。 */
  readonly className: string
  readonly onClick: () => void
  readonly children: ReactNode
}

export const BUTTON_VARIANT_CLASS = {
  outline: styles["button-variant-outline"],
  "outline-accent": styles["button-variant-outline-accent"],
  "outline-warn": styles["button-variant-outline-warn"],
  "solid-accent": styles["button-variant-solid-accent"],
  "solid-danger": styles["button-variant-solid-danger"],
  "solid-warn": styles["button-variant-solid-warn"],
  ghost: styles["button-variant-ghost"],
  link: styles["button-variant-link"],
} satisfies Record<ButtonVariant, string | undefined>

const BUTTON_PRESSED_ARIA = {
  none: undefined,
  on: "true",
  off: "false",
} satisfies Record<ButtonPressed, "true" | "false" | undefined>

export function Button(props: ButtonProps): ReactElement {
  const className = [
    styles["button"],
    BUTTON_VARIANT_CLASS[props.variant],
    TEXT_SIZE_CLASS[props.size],
    props.className,
  ]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" ")

  const handleClick = (): void => {
    // **押せないときは呼ばない**（`aria-disabled` は native の `disabled` と違いクリックを
    // 止めないので、ここで読み替える）。
    if (props.disabled) {
      return
    }
    props.onClick()
  }

  return (
    <button
      type={props.type}
      className={className}
      aria-pressed={BUTTON_PRESSED_ARIA[props.pressed]}
      aria-disabled={props.disabled}
      aria-label={props.ariaLabel}
      aria-haspopup={props.ariaHasPopup}
      title={props.title}
      onClick={handleClick}
    >
      {props.children}
    </button>
  )
}
