// ツールの実行1件。**利用者が見るべきものだけに絞る**（`docs/requirements.md` 4.2）。
// 出すのはファイルを変えた操作（ツール名とパス）・サブエージェントの起動（タスク名）・
// 失敗したツール（エラーの内容込み）の3種類だけで、それ以外（コマンドの出力・読み取りや
// 検索・未知のツール名）は何も描かない。**絞る判断は `protocol/main-view.ts` の
// `toolVisibility`**（サーバ・ブラウザのどちらでも同じ結果になる純粋関数）で、ここは
// その結果を HTML に変えるだけ。

import { type ReactElement } from "react"

import { toolVisibility, type MainViewToolRun } from "../../protocol/main-view.ts"

// ツールの入力・出力は数十KBになることがある（実測: あるツールの --json 出力が170KB）。
// 切り詰めは表示を壊さないためであって秘匿のためではないので、切り詰めた旨だけ添えて残りは捨てる。
const MAX_TOOL_TEXT_LENGTH = 8000

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
  if (visibility.kind === "failed") {
    return <FailedTool entry={props.entry} />
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

/** 失敗したツールの表示。**ツールの種類によらず、引数と結果（エラーの内容）をそのまま出す。** */
function FailedTool(props: { readonly entry: MainViewToolRun }): ReactElement {
  const { entry } = props
  const inputText = truncateForDisplay(stringifyToolInput(entry.input))

  return (
    <section className="tool-block tool-block-failed">
      <h3>{entry.name}</h3>
      <pre className="tool-input">
        <code>{inputText}</code>
      </pre>
      {entry.result === undefined ? (
        <p className="tool-pending">実行中…</p>
      ) : (
        <pre className={`tool-result${entry.result.isError ? " tool-error" : ""}`}>
          <code>{truncateForDisplay(entry.result.content)}</code>
        </pre>
      )}
    </section>
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

/** ツールの入力（`unknown`。transcript から来た JSON 値）を、読める形の文字列にする。 */
function stringifyToolInput(input: unknown): string {
  if (input === undefined) {
    return ""
  }

  const json = JSON.stringify(input, null, 2)
  return json ?? String(input)
}

/**
 * 表示を壊さない程度に文字列を切り詰める（`docs/requirements.md`「切り詰めは表示のためであって
 * 秘匿のためではない」）。折りたたんで全部見せる形は採らず、上限を超えた分は捨てて件数だけ添える。
 */
function truncateForDisplay(text: string): string {
  if (text.length <= MAX_TOOL_TEXT_LENGTH) {
    return text
  }

  const omitted = text.length - MAX_TOOL_TEXT_LENGTH
  return `${text.slice(0, MAX_TOOL_TEXT_LENGTH)}\n…（以下 ${String(omitted)} 文字を省略）`
}
