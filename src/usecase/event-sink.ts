// SDK のイベントを受けて姿を更新し、配る係を呼ぶ「決める」層。畳み込みそのものは純粋関数
// （applySessionEvent。src/protocol/session-state.ts）だが、**セッションの姿を持つのはここ1箇所だけ**。
//
// HTML の組み立て（答え待ちの箱など）は presentation の仕事なので、ここは PendingAsk のような
// 決めた結果までしか渡さない。呼び出し側（src/index.ts）が HTML に組み立ててから配る。

import { WORKING_EXPRESSION_DELAY_MS } from "../protocol/expression.ts"
import { type SessionEvent } from "../protocol/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
  type ToolActivity,
} from "../protocol/session-state.ts"

/**
 * イベントを受けて姿を更新し、配る係を呼ぶ。**セッションの姿を持つのはここ1箇所だけ**
 * （畳み込みそのものは純粋関数。src/protocol/session-state.ts）。
 *
 * **入力欄（進行状態・経過時間・答え待ちの箱・`/` 補完）はもうここの役目ではない**
 * （2026-09-13 段4。WebSocket 経由で届く `SessionState` に `turnStartedAt` / `turnFinishedAt` /
 * `pending` / `commandDescriptions` / `slashCommands` がすでに入っていて、`src/ui/dispatch/` が
 * 直接そこから計算する。旧の `publishTurnStatus` / `publishPendingAnswer` / `setCommands` は
 * 消えた）。ここに残るのは、まだ移っていないメイン・キャラビュー（`publish`）と、表情の
 * 「作業中」への遅延切り替えだけ。
 *
 * **表情の「作業中」への遅延切り替え（{@link workingRefreshDelayMs}）もここで進める。**
 * ツールの開始・終了だけでは、遅延が経過した「その瞬間」には何のイベントも来ないので、
 * 何もしなければ次のイベントが来るまで表情が切り替わらない。実行中のツールがあってまだ
 * 「作業中」になっていないときだけ、遅延の残り時間ぶん先に1回だけ配り直すタイマーを立てる
 * （タイマーは常に1本だけ。イベントが来るたびに立て直す）。
 *
 * `now` は現在時刻を返す関数（呼び出し側が `Date.now` を渡す）。ここで直接 `Date.now()` を
 * 呼ばないのは、偽の時計を差し込んでテストできるようにするため。
 */
export function createEventSink(
  publish: (view: SessionState) => void,
  onSessionEnded: (reason: string) => void,
  now: () => number,
): (event: SessionEvent) => void {
  let view = INITIAL_SESSION_STATE
  let workingRefreshTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const publishAndScheduleWorkingRefresh = (): void => {
    publish(view)

    if (workingRefreshTimer !== undefined) {
      clearTimeout(workingRefreshTimer)
      workingRefreshTimer = undefined
    }
    const delay = workingRefreshDelayMs(view.runningTools, now())
    if (delay === undefined) {
      return
    }
    workingRefreshTimer = setTimeout(() => {
      workingRefreshTimer = undefined
      publishAndScheduleWorkingRefresh()
    }, delay)
  }

  return (event) => {
    view = applySessionEvent(view, event, now())
    if (event.kind === "session-ended") {
      onSessionEnded(event.reason)
    }
    publishAndScheduleWorkingRefresh()
  }
}

/**
 * 実行中のツールのうち、まだ「作業中」の遅延を超えていないものがあれば、超えるまでの
 * 残り時間（ミリ秒）を返す。超えているものしかない・実行中のツールが無いときは undefined
 * （その場合は時間経過だけで表情が変わることはないので、タイマーを立てる必要がない）。
 */
function workingRefreshDelayMs(
  runningTools: readonly ToolActivity[],
  now: number,
): number | undefined {
  const remaining = runningTools
    .map((tool) => tool.startedAt + WORKING_EXPRESSION_DELAY_MS - now)
    .filter((ms) => ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
}
