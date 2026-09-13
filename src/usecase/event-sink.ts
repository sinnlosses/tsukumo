// SDK のイベントを受けて姿を更新し、配る係を呼ぶ「決める」層。畳み込みそのものは純粋関数
// （applySessionEvent。src/protocol/session-state.ts）だが、**セッションの姿を持つのはここ1箇所だけ**。
//
// HTML の組み立て（答え待ちの箱など）は presentation の仕事なので、ここは PendingAsk のような
// 決めた結果までしか渡さない。呼び出し側（src/index.ts）が HTML に組み立ててから配る。

import { type SessionEvent } from "../protocol/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../protocol/session-state.ts"

/**
 * イベントを受けて姿を更新し、配る係を呼ぶ。**セッションの姿を持つのはここ1箇所だけ**
 * （畳み込みそのものは純粋関数。src/protocol/session-state.ts）。
 *
 * **入力欄（進行状態・経過時間・答え待ちの箱・`/` 補完）はもうここの役目ではない**
 * （2026-09-13 段4。WebSocket 経由で届く `SessionState` に `turnStartedAt` / `turnFinishedAt` /
 * `pending` / `commandDescriptions` / `slashCommands` がすでに入っていて、`src/ui/dispatch/` が
 * 直接そこから計算する。旧の `publishTurnStatus` / `publishPendingAnswer` / `setCommands` は
 * 消えた）。**表情の「作業中」への遅延切り替えも段5でここから消えた**（キャラビューが React の
 * 部品になり、`src/ui/character-view/character-view.tsx` の `useEffect` タイマーが受け持つ。
 * サーバ側で配り直す必要が無くなった）。ここに残るのは、まだ移っていないメインビュー
 * （`publish`）だけ。
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

  return (event) => {
    view = applySessionEvent(view, event, now())
    if (event.kind === "session-ended") {
      onSessionEnded(event.reason)
    }
    publish(view)
  }
}
