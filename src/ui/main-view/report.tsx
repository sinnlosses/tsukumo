// 1ステップぶんのレポート本文（Markdown）。**書きかけの本文を空行で塊に割り、塊ごとに
// `memo`**（`docs/design.md` 6.3）。描き直すのは変わった塊（たいてい末尾の1つ）だけで、
// 確定済みの塊は Markdown の変換をやり直さない。

import { memo, type ReactElement } from "react"

import { Markdown } from "../report/markdown.tsx"
import { splitReportBlocks } from "../report/split-blocks.ts"

export type ReportProps = {
  readonly markdown: string
}

export function Report(props: ReportProps): ReactElement {
  const blocks = splitReportBlocks(props.markdown)

  return (
    <div className="detail-block">
      {blocks.map((block) => (
        <ReportBlock key={block} text={block} />
      ))}
    </div>
  )
}

/**
 * 塊1つぶんの Markdown。**鍵（`key`）も props もその塊の文字列そのもの**なので、塊の内容が
 * 変わらない限り React はこの部品を再描画しない（`React.memo` の既定の浅い比較で足りる。
 * 文字列どうしは値が同じなら === になる）。
 */
const ReportBlock = memo(function ReportBlock(props: { readonly text: string }): ReactElement {
  return <Markdown text={props.text} />
})
