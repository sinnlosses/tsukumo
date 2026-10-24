// 依頼を SDK へ渡してから Claude Code の最初のメッセージが届くまでの遅れを見張る。
// 時刻と区間のミリ秒しか持たず、依頼の文面もメッセージも見ない。

import type { PromptDelayFootprint } from "../../../shared/diagnostic/diagnostic-record.ts"

/** どれかの区間がこれを超えたら1行書く（ちょうどは書かない）。 */
export const PROMPT_DELAY_THRESHOLD_MS = 3000

export type PromptDelayWatch = {
  /**
   * 依頼を SDK へ渡した。追っていた前の依頼は捨てて、この依頼を追う。
   * `startedAt` は渡す手順に入った時刻で、`at` との差が準備の区間になる（`undefined` は準備なし）。
   */
  readonly pushed: (at: number, startedAt: number | undefined) => void
  /** 追っている依頼を捨てる（中断・駆動の終わり）。 */
  readonly discard: () => void
  /** SDK が依頼を書き終えた（入力の生成器が再開した）。 */
  readonly written: (at: number) => void
  /** Claude Code からメッセージが届いた。書き終える前の分は数えない。 */
  readonly received: (at: number) => void
}

type Tracking =
  | { readonly stage: "idle" }
  | { readonly stage: "pushed"; readonly pushedAt: number; readonly prepareMs: number }
  | {
      readonly stage: "written"
      readonly pushedAt: number
      readonly prepareMs: number
      readonly writtenAt: number
    }

export function createPromptDelayWatch(
  report: (footprint: PromptDelayFootprint) => void,
): PromptDelayWatch {
  let tracking: Tracking = { stage: "idle" }
  return {
    pushed: (at, startedAt) => {
      tracking = { stage: "pushed", pushedAt: at, prepareMs: at - (startedAt ?? at) }
    },
    discard: () => {
      tracking = { stage: "idle" }
    },
    written: (at) => {
      if (tracking.stage === "pushed") {
        tracking = {
          stage: "written",
          pushedAt: tracking.pushedAt,
          prepareMs: tracking.prepareMs,
          writtenAt: at,
        }
      }
    },
    received: (at) => {
      if (tracking.stage !== "written") {
        return
      }
      const { pushedAt, prepareMs, writtenAt } = tracking
      tracking = { stage: "idle" }
      const writeMs = writtenAt - pushedAt
      const replyMs = at - writtenAt
      if (
        prepareMs > PROMPT_DELAY_THRESHOLD_MS ||
        writeMs > PROMPT_DELAY_THRESHOLD_MS ||
        replyMs > PROMPT_DELAY_THRESHOLD_MS
      ) {
        report({ flow: "prompt-delay", at, pushedAt, prepareMs, writeMs, replyMs })
      }
    },
  }
}
