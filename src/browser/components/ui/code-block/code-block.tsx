// コードの段（行番号・言語名・コピーのボタン付き）を描く部品。中身は Astryx の `CodeBlock`。
// 折り返さず、長い行は横にスクロールする。

import { CodeBlock as AstryxCodeBlock } from "@astryxdesign/core/CodeBlock"
import type { ReactElement } from "react"

export type CodeBlockProps = {
  readonly code: string
  readonly language?: string
}

export function CodeBlock(props: CodeBlockProps): ReactElement {
  return (
    <AstryxCodeBlock
      code={props.code}
      language={props.language}
      hasLineNumbers
      hasLanguageLabel
      hasCopyButton
    />
  )
}
