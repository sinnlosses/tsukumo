// 答え待ちの印（帯の右端と、狭い画面の「≡」の中に出す1つの字）。**色だけにしない**ので、
// `--state-warn` の色に「答え待ち」の字を載せる（docs/design.md 13.1 原則1 / 13.9）。
//
// 出すかどうかは置いた側が決める（この部品は判定を持たない）。**字を1箇所にしておく**ため、
// 「≡」の `aria-label` が使う {@link PENDING_NOTE} もここから配る。

import { type ReactElement } from "react"

import styles from "../screen-nav.module.css"

/** 答え待ちの印の字。 */
export const PENDING_NOTE = "答え待ち"

export function ScreenNavPending(): ReactElement {
  return <span className={styles["screen-nav-pending"]}>{PENDING_NOTE}</span>
}
