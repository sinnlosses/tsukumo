// 帯の左端、部屋の名前の左に出すキャラクターの顔（`docs/design.md` 13.9「顔」）。**押せない絵**で、
// 表情や衣装では変わらない1枚（`CharacterInfo.face`）。
//
// **定義に `face` が無いパックでは何も描かない**（`null` を返す。空の丸も頭文字の丸も出さない）。
// `mini` や立ち絵から切り抜いて代わりにすることもしない——ここが受け取るのは `face` の URL だけ。
//
// SVG も `<img>` で出す（差し色 `--outfit-accent` を効かせるための `Portrait` のインライン埋め込みは
// 使わない。顔は表情でも衣装でも変わらない1枚なので、SVG が内蔵する既定色のまま出ればよい）。

import { type ReactElement } from "react"

import styles from "../screen-nav.module.css"

export type ScreenNavFaceProps = {
  /** `/character/<file>` の URL。無ければ顔を出さない。 */
  readonly url: string | undefined
  /** 読み上げに渡す名前（パックの `name`）。無ければ空文字。 */
  readonly alt: string
}

export function ScreenNavFace(props: ScreenNavFaceProps): ReactElement | null {
  if (props.url === undefined) {
    return null
  }

  return <img className={styles["screen-nav-face"]} src={props.url} alt={props.alt} />
}
