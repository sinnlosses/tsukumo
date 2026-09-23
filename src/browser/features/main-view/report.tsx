// 1ステップぶんのレポート本文（Markdown）。**書きかけの本文を空行で塊に割り、塊ごとに
// `memo`**（`docs/design.md` 6.3）。描き直すのは変わった塊（たいてい末尾の1つ）だけで、
// 確定済みの塊は Markdown の変換をやり直さない。
//
// `Report` 自体も `memo` で包む。`markdown` が変わっていないステップ（確定済みの過去の
// ターン）では、`splitReportBlocks` による塊への分割そのものを省く（props は文字列と真偽値
// だけなので、既定の浅い比較で足りる）。
//
// **書き上げていくように見せる演出（`hooks/use-report-reveal.ts`）はここに掛ける。**
// 完成した DOM の根を渡すだけで、塊の中身（`memo` の効く `ReportBlock`）には触らない。

import { memo, type ReactElement } from "react"

import { useReportReveal } from "./hooks/use-report-reveal.ts"
import styles from "./main-view.module.css"
import { Markdown } from "./markdown/markdown.tsx"
import { splitReportBlocks } from "./markdown/split-blocks.ts"

export type ReportProps = {
  readonly markdown: string
  /**
   * **書き上げていくように見せるか**（`docs/requirements.md` 4.3。演出そのものは
   * `hooks/use-report-reveal.ts`）。見るのは**マウントした時点の値だけ**で、対象を選ぶのは
   * `turn.tsx`。
   */
  readonly reveal: boolean
  /**
   * この本文が載っているやり取り（`MainViewTurn.id`）。配る筆先に添える
   * （`hooks/use-report-reveal.ts`）。
   */
  readonly turnId: number
}

export const Report = memo(ReportView)

function ReportView(props: ReportProps): ReactElement {
  const blocks = splitReportBlocks(props.markdown)
  // **完成した DOM をそのまま渡す**（演出は見せる範囲を進めるだけで、塊の中身には触らない）。
  const rootRef = useReportReveal(props.reveal, props.turnId)

  return (
    <div className={styles["detail-block"]} ref={rootRef}>
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
const ReportBlock = memo(ReportBlockView)

function ReportBlockView(props: { readonly text: string }): ReactElement {
  return <Markdown text={props.text} />
}
