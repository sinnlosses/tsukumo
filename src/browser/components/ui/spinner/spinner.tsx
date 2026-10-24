// 回る輪。読み上げには出さない（意味は隣の文字が持つ）。語彙を持たない。

import clsx from "clsx"
import type { ReactElement } from "react"

import "./spinner.css"
import styles from "./spinner.module.css"

export type SpinnerProps = {
  /** 置き方と、トラックの色（`--spinner-track`）だけを渡す。 */
  readonly className: string
}

export function Spinner(props: SpinnerProps): ReactElement {
  return <span className={clsx(styles["spinner"], props.className)} aria-hidden="true" />
}
