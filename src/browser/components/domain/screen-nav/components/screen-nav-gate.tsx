// 帯に並ぶ口1つ。ただのリンクなので、リロードで同じ画面に戻り、ブラウザの「戻る」も効く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { ScreenNavGate as Gate } from "../hooks/use-screen-nav.ts"
import styles from "./screen-nav-gate.module.css"

export type ScreenNavGateProps = {
  readonly gate: Gate
  /** 押したあとに引き出しを閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

export function ScreenNavGate(props: ScreenNavGateProps): ReactElement {
  return (
    <a
      className={clsx(styles["screen-nav-gate"], props.gate.active && styles["is-active"])}
      href={props.gate.href}
      aria-current={props.gate.active ? "page" : undefined}
      onClick={props.onSelect}
    >
      {props.gate.label}
    </a>
  )
}
