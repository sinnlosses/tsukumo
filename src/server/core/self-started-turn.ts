// claude が**依頼なしで自分で始めたターン**に、続きのターンの始まり（`turn-resumed`）を補う。
//
// 背景のタスク（docs/glossary.md「背景のタスク」）が終わると、claude は依頼を待たずに続きを
// 報告するターンを始める。SDK はそのターンの頭に**依頼に当たるメッセージを流さない**（実測:
// `task_notification` → `init` → `assistant` → `result`。`result` の `origin` が
// `task-notification`）。何も補わないと、畳み込みは前のターンを `finished` のまま持ち続け、
// 帯は「依頼待ち」、吹き出しは前のターンのセリフに続けて積む（docs/screen-design.md 13.9
// 「背景のタスク」）。
//
// **合図は「ターンの外で `init` が届いた」こと。** `init`（`session-info`）はターンの頭に毎回届く
// （docs/requirements.md 4.1）ので、依頼（`request` / `turn-started`）でターンを開いていないのに
// 届いたら、claude が自分でターンを始めたと分かる。**`result` の `origin` は使わない**——届くのは
// ターンの終わりで、始まりには間に合わない。
//
// 最初のターンより前の `init` では補わない（起こした直後に `init` が届く経路を実測では見ていないが、
// 届いたら「作業中」のまま終わりが来ない）。

import { type SessionEvent } from "../../shared/session-event.ts"

/**
 * `onEvent` を包み、claude が自分で始めたターンの頭に `turn-resumed` を1つ挟んでから流す
 * 関数を返す。**駆動の送り出す全イベント（依頼も SDK 由来も）をこれに通す**——依頼で開いた
 * ターンを見ていないと、その `init` を「ターンの外」と取り違える。
 */
export function withSelfStartedTurns(
  onEvent: (event: SessionEvent) => void,
): (event: SessionEvent) => void {
  let position: TurnPosition = "before-first-turn"

  return (event) => {
    if (event.kind === "session-info" && position === "between-turns") {
      position = "in-turn"
      onEvent({ kind: "turn-resumed" })
    }
    position = nextPosition(position, event)
    onEvent(event)
  }
}

/**
 * いまターンの中に居るか。`before-first-turn` を `between-turns` と分けるのは、最初の依頼より
 * 前に届いた `init` で補わないため（冒頭のコメント）。
 */
type TurnPosition = "before-first-turn" | "in-turn" | "between-turns"

function nextPosition(position: TurnPosition, event: SessionEvent): TurnPosition {
  switch (event.kind) {
    case "request":
    case "turn-started":
      return "in-turn"
    case "turn-finished":
    case "session-ended":
      return "between-turns"
    default:
      return position
  }
}
