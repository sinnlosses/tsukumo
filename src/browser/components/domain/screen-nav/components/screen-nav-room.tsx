// 帯の左端に出す部屋の名前（`docs/screen-design.md` 13.9 / `src/shared/room.ts`）。**押せない字**で、
// 「いまどの tsukumo を見ているか」だけを名乗る（設定の操作子は帯に置かない）。
//
// 狭い画面では帯の左端が無い（「≡」だけになる）ので、**同じ部品が「≡」の中の先頭にも出る**
// （答え待ちの印と同じ畳み方。どちらを出すかは `screen-nav.module.css` の `@media`）。

import clsx from "clsx"
import { type ReactElement } from "react"

import shellStyles from "../screen-nav.module.css"
import styles from "./screen-nav-room.module.css"

export type ScreenNavRoomProps = {
  readonly name: string
}

export function ScreenNavRoom(props: ScreenNavRoomProps): ReactElement {
  // **`shellStyles["screen-nav-room"]` は見た目を持たない**（「≡」の面の中の見た目の打ち消し
  // `.screen-nav-panel .screen-nav-room` のためだけの参照）。CSS Modules は class 名を
  // ファイルごとにハッシュ化するので、`screen-nav.module.css` 側の選択子を当てるにはこのファイル
  // 自身の class も要る（docs/design.md 6.6）。
  return (
    <span className={clsx(styles["screen-nav-room"], shellStyles["screen-nav-room"])}>
      {props.name}
    </span>
  )
}
