// 帯に並ぶ口1つ（docs/design.md 13.9）。**ただのリンク**（`<a href={screenHash(...)}>`）なので、
// リロードで同じ画面に戻り、ブラウザの「戻る」も効く（画面の正典は `location.hash`。13.6）。
//
// **いま出している画面の口は、狭い画面のタブ（`.layout-tab.is-active`）と同じ示し方**にする
// （枠の色・地の濃さ・字の濃さ。**色だけで伝えない**。13.1 原則1）。ここに残す判断は
// **class を選ぶ分岐だけ**で、「どれがいまの画面か」は `hooks/use-screen-nav.ts` が畳んである。

import { type ReactElement } from "react"

import { type ScreenNavGate as Gate } from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavGateProps = {
  readonly gate: Gate
  /** 押したあとに「≡」を閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

export function ScreenNavGate(props: ScreenNavGateProps): ReactElement {
  return (
    <a
      className={`${styles["screen-nav-gate"]}${
        props.gate.active ? ` ${styles["is-active"]}` : ""
      }`}
      href={props.gate.href}
      aria-current={props.gate.active ? "page" : undefined}
      onClick={props.onSelect}
    >
      {props.gate.label}
    </a>
  )
}
