// 入力欄の殻。中身は Astryx の `ChatComposer`（本体は角丸の面1つで、触れたときと入力中に影が強まる）。
// `ChatComposer` 自身の送信は文字列だけを扱うので使わず、`onSubmit` は何もしない。
// 入力の面・送信の可否・下書きは差し込む側が持ち、殻は配置と見た目だけを受け持つ。
// 入力・道具・操作の口以外（引き出し・頭の枠・状態の帯）は使わない。

import { ChatComposer } from "@astryxdesign/core/Chat"
import type { ReactElement, ReactNode } from "react"

export type ComposerShellProps = {
  /** 入力の面（添付の札・`<textarea>`・補完の一覧）。 */
  readonly input: ReactNode
  /** 下の行の左。 */
  readonly tools: ReactNode
  /** 下の行の右。 */
  readonly actions: ReactNode
  /** 置き方（margin・flex など）だけを渡す。 */
  readonly className: string
}

export function ComposerShell(props: ComposerShellProps): ReactElement {
  return (
    <ChatComposer
      className={props.className}
      onSubmit={ignoreSubmit}
      value=""
      input={props.input}
      footerActions={props.tools}
      sendButton={props.actions}
    />
  )
}

function ignoreSubmit(): void {
  // 送信は差し込んだ送信ボタンが持つ。
}
