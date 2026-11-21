// コードの段（行番号・言語名・コピーのボタン付き）を描く部品。中身は Astryx の `CodeBlock`。
// 折り返さず、長い行は横にスクロールする。

import { CodeBlock as AstryxCodeBlock } from "@astryxdesign/core/CodeBlock"
import type { ReactElement, ReactNode } from "react"

export type CodeBlockProps = {
  readonly code: string
  readonly language?: string
  /** 頭の帯の左に出す字（ファイルのパスなど）。 */
  readonly title?: string
  /** 1 行目がファイルの何行目か。行番号と `highlightLines` はこの数から数える。 */
  readonly startLineNumber?: number
  /** 地を塗る行。`startLineNumber` から数えた行番号で渡す。 */
  readonly highlightLines?: readonly number[]
  /** `+`・`-` で始まる行を足した行・消した行として描くか。 */
  readonly isDiff?: boolean
  /** 既定のコピーのボタンを出すか。写す字を替えたいときは `false` にして `endContent` に置く。 */
  readonly hasCopyButton?: boolean
  /** 頭の帯のコピーのボタンの手前に置く操作。 */
  readonly endContent?: ReactNode
}

export function CodeBlock(props: CodeBlockProps): ReactElement {
  return (
    <AstryxCodeBlock
      code={props.code}
      language={props.language}
      title={props.title}
      startLineNumber={props.startLineNumber}
      highlightLines={props.highlightLines === undefined ? undefined : [...props.highlightLines]}
      isDiff={props.isDiff}
      endContent={props.endContent}
      width="100%"
      hasLineNumbers
      hasLanguageLabel
      hasCopyButton={props.hasCopyButton ?? true}
    />
  )
}
