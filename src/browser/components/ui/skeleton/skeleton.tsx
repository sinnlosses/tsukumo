// 読み込み中の塊。明滅だけを持ち、読み上げには出さない。語彙を持たない。

import clsx from "clsx"
import type { CSSProperties, ReactElement, ReactNode } from "react"

import styles from "./skeleton.module.css"

export type SkeletonProps = {
  /** 色・寸法・明滅の遅れ（`animation-delay`）を渡す。 */
  readonly className: string
  readonly style: CSSProperties | undefined
  readonly children: ReactNode
}

export function Skeleton(props: SkeletonProps): ReactElement {
  return (
    <span
      className={clsx(styles["skeleton"], props.className)}
      style={props.style}
      aria-hidden="true"
    >
      {props.children}
    </span>
  )
}
