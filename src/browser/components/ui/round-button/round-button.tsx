// 絵だけのボタンの部品。入力欄の送信と中断に使う。中身は Astryx の `IconButton`。
// 見える字が無いので `ariaLabel` を必須にする。

import { IconButton } from "@astryxdesign/core/IconButton"
import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import styles from "./round-button.module.css"

type RoundButtonAction =
  | { readonly kind: "submit" }
  | { readonly kind: "press"; readonly onClick: () => void }

export type RoundButtonProps = {
  readonly action: RoundButtonAction
  readonly ariaLabel: string
  readonly title: string
  readonly disabled: boolean
  /** `solid` は塗る（primary）、`quiet` は枠だけ（secondary）、`neutral` は塗らずに地へなじませる（secondary。中断）。 */
  readonly emphasis: "solid" | "quiet" | "neutral"
  /** 置き方（margin・flex など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

const ASTRYX_VARIANT = {
  solid: "primary",
  quiet: "secondary",
  neutral: "secondary",
} as const satisfies Record<RoundButtonProps["emphasis"], string>

export function RoundButton(props: RoundButtonProps): ReactElement {
  // `title` は IconButtonProps の型に無いが、実行時は DOM へ届く。
  const passthrough = { title: props.title }
  return (
    <IconButton
      {...passthrough}
      type={props.action.kind === "submit" ? "submit" : "button"}
      label={props.ariaLabel}
      icon={props.children}
      variant={ASTRYX_VARIANT[props.emphasis]}
      size="md"
      data-emphasis={props.emphasis}
      isDisabled={props.disabled}
      className={clsx(styles.circle, props.className)}
      onClick={props.action.kind === "press" ? props.action.onClick : undefined}
    />
  )
}
