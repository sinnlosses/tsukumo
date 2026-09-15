// ツールの実行1件。**利用者が見るべきものだけに絞る**（`docs/requirements.md` 4.2）。
// 出すのはファイルを変えた操作（ツール名とパス）・サブエージェントの起動（タスク名）の
// 2種類だけで、それ以外（コマンドの出力・読み取りや検索・未知のツール名）は何も描かない。
// **失敗したツールもここには出さない**（引数と出力はサイドバーの「いま何をしているか」から
// 開く。2026-09-15 決定）。**絞る判断は `protocol/main-view.ts` の `toolVisibility`**
// （サーバ・ブラウザのどちらでも同じ結果になる純粋関数）で、ここはその結果を HTML に変えるだけ。

import { type ReactElement } from "react"

import { toolVisibility, type MainViewToolRun } from "../../protocol/main-view.ts"

const FILE_PATH_UNKNOWN_LABEL = "(パス不明)"
const AGENT_DESCRIPTION_UNKNOWN_LABEL = "(タスク名不明)"

export type ToolRunProps = {
  readonly entry: MainViewToolRun
}

/** 見せない判定（`hidden`）のときは何も描かない（`null` を返す）。 */
export function ToolRun(props: ToolRunProps): ReactElement | null {
  const visibility = toolVisibility(props.entry)

  if (visibility.kind === "hidden") {
    return null
  }
  if (visibility.kind === "file-change") {
    return <LabeledTool entry={props.entry} label={visibility.path ?? FILE_PATH_UNKNOWN_LABEL} />
  }
  return (
    <LabeledTool
      entry={props.entry}
      label={visibility.description ?? AGENT_DESCRIPTION_UNKNOWN_LABEL}
    />
  )
}

/**
 * ファイルを変えた操作／サブエージェントの起動の表示。**引数や出力は出さず、
 * ツール名とラベル（パス、またはタスク名）だけを見出しに出す。**
 */
function LabeledTool(props: {
  readonly entry: MainViewToolRun
  readonly label: string
}): ReactElement {
  return (
    <section className="tool-block">
      <h3>
        {props.entry.name}: {props.label}
      </h3>
      {props.entry.result === undefined && <p className="tool-pending">実行中…</p>}
    </section>
  )
}
