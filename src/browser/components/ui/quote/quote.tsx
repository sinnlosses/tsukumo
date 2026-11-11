// 引用の文と出典の1行を描く部品。中身は Astryx の `Blockquote`。

import { Blockquote } from "@astryxdesign/core/Blockquote"
import type { ReactElement, ReactNode } from "react"

export type QuoteProps = {
  /** 出典の1行。無いなら空の文字列。 */
  readonly source: ReactNode
  readonly children: ReactNode
}

export function Quote(props: QuoteProps): ReactElement {
  return <Blockquote cite={props.source}>{props.children}</Blockquote>
}
