// 窓の中のやり取りごとの結果（`TurnResult`）。やり取りの記録と、いちばん新しいやり取りの局面から導くだけで、状態は持たない。

import type { ConversationMoment } from "./conversation-moment.ts"
import type { MainViewStepBody, MainViewTurn } from "./main-view.ts"

type MainViewTextBody = Extract<MainViewStepBody, { readonly kind: "text" }>

/**
 * やり取りがどう終わったか。
 * `working` と `awaiting-answer` の一部（答え待ちの列があるもの）は、まだ閉じていないいちばん新しいやり取りだけがなる。
 * `stopped` は最後の本文の `task.outcome` が `stopped`（止めた。答えは待っていない）、`no-report` は閉じたのに本文が1つも無いやり取り。
 */
export type TurnResult = "done" | "awaiting-answer" | "stopped" | "failed" | "working" | "no-report"

/**
 * `turns` と同じ並びで、やり取りごとの結果を返す。
 * `newestMoment` はいちばん新しいやり取りの局面（`conversationMoment`）で、それより前のやり取りは閉じている。
 */
export function turnResultsOf(
  turns: readonly MainViewTurn[],
  newestMoment: ConversationMoment,
): readonly TurnResult[] {
  return turns.map((turn, index) =>
    index === turns.length - 1 ? newestResultOf(turn, newestMoment) : closedResultOf(turn),
  )
}

function newestResultOf(turn: MainViewTurn, moment: ConversationMoment): TurnResult {
  switch (moment) {
    case "work":
      return "working"
    case "ask":
      return "awaiting-answer"
    case "greet":
    case "deliver":
    case "stumble":
      return closedResultOf(turn)
  }
}

function closedResultOf(turn: MainViewTurn): TurnResult {
  if (turn.failure.kind === "failed") {
    return "failed"
  }
  const lastBody = turn.steps
    .map((step) => step.body)
    .findLast((body): body is MainViewTextBody => body.kind === "text")
  if (lastBody === undefined) {
    return "no-report"
  }
  if (lastBody.task.kind === "none") {
    return "done"
  }
  switch (lastBody.task.outcome) {
    case "finished":
      return "done"
    case "awaiting-answer":
      return "awaiting-answer"
    case "stopped":
      return "stopped"
  }
}
