// 帯に出す「いまの動き方」の読み（モデル・許可モード。docs/design.md 13.9）。
// **押せない字**で、値を名乗るだけ（`<select>` とボタンはサイドバーに残す。13.6）。
//
// **1つの部品に畳んである**のは、2つが1つのまとまりとして動くため——狭い画面では丸ごと
// 「≡」の中へ入る。部屋の名前・答え待ちと同じく、広い画面の帯と「≡」の落ちてくる面の
// 両方に同じ部品が出る。
//
// **区切りの記号は置かない**。等幅（機械が付けた名前＝モデル）と本文書体
// （人の言葉＝許可モード）の交替がそのまま区切りになる（13.1 原則3）。

import { type ReactElement } from "react"

import { type ScreenNavReading } from "../hooks/use-screen-nav.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavStatusProps = {
  readonly readings: readonly ScreenNavReading[]
}

/** 読みの種類ごとの class（書体と縮み方がここで分かれる）。 */
const READING_CLASS = {
  model: "screen-nav-model",
  "permission-mode": "screen-nav-permission-mode",
} satisfies Record<ScreenNavReading["kind"], string>

export function ScreenNavStatus(props: ScreenNavStatusProps): ReactElement {
  return (
    <span className={styles["screen-nav-status"]}>
      {props.readings.map((reading) => (
        <span key={reading.kind} className={readingClassName(reading)}>
          {reading.text}
        </span>
      ))}
    </span>
  )
}

/**
 * 読み1つに付ける class。**「全部許す」だけ字に `--state-ng` を載せる**（`is-danger`）——
 * 「全部許す」の文字が必ず付いているので、色だけで意味を伝えることにならない（13.1 原則5）。
 */
function readingClassName(reading: ScreenNavReading): string {
  const base = styles[READING_CLASS[reading.kind]] ?? ""
  return reading.dangerous ? `${base} ${styles["is-danger"]}` : base
}
