// 回る輪。中身は Astryx の `Spinner`。読み上げには出さない（意味は隣の文字が持つ）。語彙を持たない。
// `spinner.css` は、輪を自前で描く部品（`--spinner-animation` を読む側）へ回転の `@keyframes` を渡す唯一の置き場所。

import { Spinner as AstryxSpinner } from "@astryxdesign/core/Spinner"
import type { ReactElement } from "react"

import "./spinner.css"

export type SpinnerProps = {
  /** 置き方だけを渡す。 */
  readonly className: string
}

export function Spinner(props: SpinnerProps): ReactElement {
  return <AstryxSpinner size="sm" className={props.className} aria-hidden="true" />
}
