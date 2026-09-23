// 帯に並ぶ口1つ（docs/screen-design.md 13.9）。**ただのリンク**（`<a href={screenHref(...)}>`）なので、
// リロードで同じ画面に戻り、ブラウザの「戻る」も効く（画面の正典は `location.hash`。13.6）。
//
// **いま出している画面の口は、字の濃さ・太さ・差し色の下線で示す**（**色だけで伝えない**。
// 13.1 原則1。「≡」の面の中では狭い画面のタブと同じ丸い枠になる）。ここに残す判断は
// **class を選ぶ分岐だけ**で、「どれがいまの画面か」は `hooks/use-screen-nav.ts` が畳んである。

import { type ReactElement } from "react"

import { type ScreenNavGate as Gate } from "../hooks/use-screen-nav.ts"
import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-gate.module.css"

export type ScreenNavGateProps = {
  readonly gate: Gate
  /** 押したあとに「≡」を閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

export function ScreenNavGate(props: ScreenNavGateProps): ReactElement {
  // **`shellStyles` は見た目を持たない**（「≡」の面の中の見た目の打ち消し
  // `.screen-nav-panel .screen-nav-gate` / `.is-active` のためだけの参照）。CSS Modules は
  // class 名をファイルごとにハッシュ化するので、`screen-nav.module.css` 側の選択子を当てるには
  // このファイル自身の class も要る（docs/design.md 6.6）。
  const activeClass = props.gate.active ? ` ${styles["is-active"]} ${shellStyles["is-active"]}` : ""
  return (
    <a
      className={`${styles["screen-nav-gate"]} ${shellStyles["screen-nav-gate"]}${activeClass}`}
      href={props.gate.href}
      aria-current={props.gate.active ? "page" : undefined}
      onClick={props.onSelect}
    >
      {props.gate.label}
    </a>
  )
}
