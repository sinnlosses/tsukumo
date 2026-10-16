// 依頼を送ってから次の依頼を送るまでに、tsukumo のツール以外のツールが呼ばれたかを持つ。
// 立っているあいだは雑談の `remember` を通さない。
//
// tsukumo の MCP サーバのツール（`isTsukumoTool`）を許す側とし、それ以外の名前はすべて外部由来に数える。
// 印を立てるのは PreToolUse のフックから。ツールが走る前に立つので、結果がモデルへ届くより必ず先になる。
// 下ろすのは駆動が依頼を送ったとき（`request` と `turn-started`）だけ。
// 脇の話・claude が自分で始めた続きのターン（`turn-resumed`）・ターンの終わりでは下ろさない。続きのターンにも前の結果が載る。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import { isTsukumoTool } from "./tsukumo-tool-name.ts"

export type ExternalToolMark = {
  /** PreToolUse のフックから、呼ばれたツールの名前を渡す（サブエージェントの中の呼び出しも渡す）。 */
  readonly observeTool: (toolName: string) => void
  /** 駆動が送り出す依頼のイベントを渡す。 */
  readonly observe: (event: SessionEvent) => void
  /** 印が下りているか（下りていれば `remember` を通してよい）。 */
  readonly allowsRemember: () => boolean
}

/** {@link ExternalToolMark} を1つ作る。駆動1つに1つ。 */
export function createExternalToolMark(): ExternalToolMark {
  let raised = false

  return {
    observeTool: (toolName) => {
      if (!isTsukumoTool(toolName)) {
        raised = true
      }
    },
    observe: (event) => {
      if (event.kind === "request" || event.kind === "turn-started") {
        raised = false
      }
    },
    allowsRemember: () => !raised,
  }
}
