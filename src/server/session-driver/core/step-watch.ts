// 歩数の見張り。1 ターンでメインが呼んだツールの数が上限を超えたら、そのターンに 1 回だけ知らせる。
// 数えるのはメイン自身のツール呼び出し（`tool-started` のうちサブエージェントの中ではないもの）。
// 時計もタイマーも持たず、イベントだけで決める。

import type { SessionEvent } from "../../../shared/session/session-event.ts"

export type StepWatch = {
  /** 駆動が送り出すイベントを渡す。上限を超えた最初の 1 回だけ `exceeded` を返す。 */
  readonly observe: (event: SessionEvent) => "none" | "exceeded"
}

/** {@link StepWatch} を 1 つ作る。セッション 1 つに 1 つ。 */
export function createStepWatch(limit: number): StepWatch {
  let steps = 0
  let notified = false
  return {
    observe: (event) => {
      switch (event.kind) {
        case "tool-started":
          if (event.parentToolUseId !== undefined) {
            return "none"
          }
          steps += 1
          if (steps > limit && !notified) {
            notified = true
            return "exceeded"
          }
          return "none"
        case "turn-finished":
        case "session-ended":
          steps = 0
          notified = false
          return "none"
        default:
          return "none"
      }
    },
  }
}
