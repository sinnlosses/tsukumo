// 円形のボタンの部品。入力欄の送信と中断に使う。32px 四方で、絵だけを中に置く。
// 見える字が無いので `ariaLabel` を必須にする。

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
  /** `solid` は塗る、`quiet` は枠だけ、`neutral` は塗らずに地へなじませる（中断）。 */
  readonly emphasis: "solid" | "quiet" | "neutral"
  /** 置き方（margin・flex など）だけを渡す。 */
  readonly className: string
  readonly children: ReactNode
}

export function RoundButton(props: RoundButtonProps): ReactElement {
  return (
    <button
      type={props.action.kind === "submit" ? "submit" : "button"}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      title={props.title}
      data-emphasis={props.emphasis}
      className={clsx(styles["round-button"], props.className)}
      onClick={props.action.kind === "press" ? props.action.onClick : undefined}
    >
      {props.children}
    </button>
  )
}
