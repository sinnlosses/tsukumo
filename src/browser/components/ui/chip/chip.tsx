// 札の部品。部屋の頭の入口（「成果」）・絞り込み・入力欄の札（「Fable・高」）に使う。
// 押せる札は `button`、押せない札は `span`。押された状態は `aria-pressed` で伝える。

import clsx from "clsx"
import type { ReactElement } from "react"

import styles from "./chip.module.css"

type ChipCount = { readonly kind: "none" } | { readonly kind: "shown"; readonly value: number }

type ChipAction =
  | { readonly kind: "static" }
  | { readonly kind: "button"; readonly pressed: boolean; readonly onClick: () => void }

export type ChipProps = {
  readonly label: string
  /** 語の後ろに添える数。 */
  readonly count: ChipCount
  readonly action: ChipAction
  /** 置き方（margin・flex など）だけを渡す。 */
  readonly className: string
}

export function Chip(props: ChipProps): ReactElement {
  const content = (
    <>
      {props.label}
      {props.count.kind === "shown" && (
        <span className={styles["chip-count"]}>{String(props.count.value)}</span>
      )}
    </>
  )

  if (props.action.kind === "static") {
    return <span className={clsx(styles["chip"], props.className)}>{content}</span>
  }
  return (
    <button
      type="button"
      className={clsx(styles["chip"], styles["chip-button"], props.className)}
      aria-pressed={props.action.pressed}
      onClick={props.action.onClick}
    >
      {content}
    </button>
  )
}
