// 帯の左端に出す部屋の名前（`docs/design.md` 13.9 / `src/shared/room.ts`）。**押せない字**で、
// 「いまどの tsukumo を見ているか」だけを名乗る（設定の操作子は帯に置かない）。
//
// 狭い画面では帯の左端が無い（「≡」だけになる）ので、**同じ部品が「≡」の中の先頭にも出る**
// （答え待ちの印と同じ畳み方。どちらを出すかは `screen-nav.module.css` の `@media`）。
//
// **触れると作業先とコードの出所の2行が出る**（`title`）。どちらも長いパスなので帯には字として
// 出さず、「どの tsukumo か」を確かめに来た人だけが読めればよい（13.9）。

import { type ReactElement } from "react"

import styles from "../screen-nav.module.css"

export type ScreenNavRoomProps = {
  readonly name: string
  /** 作業先とコードの出所の2行。**まだ届いていないときは空**で、そのときは `title` を付けない。 */
  readonly places: string
}

export function ScreenNavRoom(props: ScreenNavRoomProps): ReactElement {
  return (
    <span
      className={styles["screen-nav-room"]}
      title={props.places === "" ? undefined : props.places}
    >
      {props.name}
    </span>
  )
}
