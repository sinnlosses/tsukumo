// 依頼を SDK へ渡してから本体の最初のメッセージが届くまでの遅れを見張る。
// 時刻と区間のミリ秒しか持たず、依頼の文面もメッセージも見ない。

import type { PromptDelayFootprint } from "../../../shared/diagnostic/diagnostic-record.ts"

/** どちらかの区間がこれを超えたら1行書く（ちょうどは書かない）。 */
export const PROMPT_DELAY_THRESHOLD_MS = 3000

export type PromptDelayWatch = {
  /** 依頼を SDK へ渡した。追っていた前の依頼は捨てて、この依頼を追う。 */
  readonly pushed: (at: number) => void
  /** 追っている依頼を捨てる（中断・駆動の終わり）。 */
  readonly discard: () => void
  /** SDK が依頼を書き終えた（入力の生成器が再開した）。 */
  readonly written: (at: number) => void
  /** 本体からメッセージが届いた。書き終える前の分は数えない。 */
  readonly received: (at: number) => void
}

type Tracking =
  | { readonly stage: "idle" }
  | { readonly stage: "pushed"; readonly pushedAt: number }
  | { readonly stage: "written"; readonly pushedAt: number; readonly writtenAt: number }

export function createPromptDelayWatch(
  report: (footprint: PromptDelayFootprint) => void,
): PromptDelayWatch {
  let tracking: Tracking = { stage: "idle" }
  return {
    pushed: (at) => {
      tracking = { stage: "pushed", pushedAt: at }
    },
    discard: () => {
      tracking = { stage: "idle" }
    },
    written: (at) => {
      if (tracking.stage === "pushed") {
        tracking = { stage: "written", pushedAt: tracking.pushedAt, writtenAt: at }
      }
    },
    received: (at) => {
      if (tracking.stage !== "written") {
        return
      }
      const { pushedAt, writtenAt } = tracking
      tracking = { stage: "idle" }
      const writeMs = writtenAt - pushedAt
      const replyMs = at - writtenAt
      if (writeMs > PROMPT_DELAY_THRESHOLD_MS || replyMs > PROMPT_DELAY_THRESHOLD_MS) {
        report({ flow: "prompt-delay", at, pushedAt, writeMs, replyMs })
      }
    },
  }
}
