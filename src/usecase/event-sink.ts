// SDK のイベントを受けて姿を更新し、配る係を呼ぶ「決める」層。畳み込みそのものは純粋関数
// （applySessionEvent。src/usecase/session-view.ts）だが、**セッションの姿を持つのはここ1箇所だけ**。
//
// HTML の組み立て（答え待ちの箱など）は presentation の仕事なので、ここは PendingAsk のような
// 決めた結果までしか渡さない。呼び出し側（src/index.ts）が HTML に組み立ててから配る。

import { WORKING_EXPRESSION_DELAY_MS } from "../domain/expression.ts"
import { type PendingAsk } from "../domain/pending-answer.ts"
import { type CommandDescription, type SessionEvent } from "../domain/session-event.ts"
import {
  applySessionEvent,
  commandSuggestions,
  INITIAL_SESSION_VIEW,
  type SessionView,
  type ToolActivity,
} from "./session-view.ts"

/**
 * ターンの進行状態（開始・終了時刻）。`src/presentation/view.ts` の `TurnStatus` と同じ形だが、
 * **presentation を import しない**（原則3。`src/infrastructure/character-asset.ts` が
 * `CharacterPortraitSource` を presentation 側と別に持つのと同じ理由）。
 */
type TurnStatusSnapshot = {
  readonly turnStartedAt: number | undefined
  readonly turnFinishedAt: number | undefined
}

/**
 * イベントを受けて姿を更新し、配る係を呼ぶ。**セッションの姿を持つのはここ1箇所だけ**
 * （畳み込みそのものは純粋関数。src/usecase/session-view.ts）。
 *
 * **`turnInProgress` が変わったときだけ `publishTurnStatus` を呼ぶ。** 書きかけの本文は
 * トークン単位で届くため、変わっていないのに毎回押すと入力欄の SSE だけ無駄に流れてしまう。
 *
 * **答え待ちの列の先頭（`view.pending[0]`）が変わったときだけ `publishPendingAnswer` を呼ぶ**
 * （同じ考え方。同一判定は `id`。答えたら列が進み、次が出る。無くなったら undefined を渡す
 * 。docs/requirements.md 4.7「答えるのは入力の動作なので入力欄の側に置く」）。
 *
 * **`turnStartedAt` / `turnFinishedAt`（経過時間の起点・終点）もここで持つ。** `now()` を
 * 呼ぶのは副作用なので、純粋な畳み込み（src/usecase/session-view.ts）の外に置く。`request` が
 * 来るたびに `turnStartedAt` を更新し `turnFinishedAt` を undefined に戻し、`turn-finished` /
 * `session-ended` が来たときだけ `turnFinishedAt` を入れる（それ以外では前の値をそのまま持ち
 * 続ける）。表す意味は「依頼を送ってから、そのターンが終わるまでの時間」で、終わったら
 * `turnFinishedAt` が止め、次の `request` まではそのまま止まって見える。**渡す先は
 * `publishTurnStatus` だけ**（2026-09-12 T-075 決定。経過時間の表示先が入力欄側
 * （送信ボタンと同じ行）へ移ったので、サイドバー向けの `publish` はもうこの2つを要らない）。
 * `turnInProgress` の変化と同じ瞬間に確定するので、`publishTurnStatus` を呼ぶ直前に
 * 更新しておく。
 *
 * **表情の「作業中」への遅延切り替え（{@link workingRefreshDelayMs}）もここで進める。**
 * ツールの開始・終了だけでは、遅延が経過した「その瞬間」には何のイベントも来ないので、
 * 何もしなければ次のイベントが来るまで表情が切り替わらない。実行中のツールがあってまだ
 * 「作業中」になっていないときだけ、遅延の残り時間ぶん先に1回だけ配り直すタイマーを立てる
 * （タイマーは常に1本だけ。イベントが来るたびに立て直す）。
 *
 * **`setCommands` は毎イベントで呼ぶ。** 候補は `session-info` と `command-descriptions` でしか
 * 変わらないが、変わったかどうかをここで判定する必要はない（呼び出し先の変数への代入は
 * 副作用として軽く、`publishTurnStatus` / `publishPendingAnswer` のような SSE の押し出しとは
 * 違って毎回呼んでも配信は増えない）。
 *
 * `now` は現在時刻を返す関数（呼び出し側が `Date.now` を渡す）。ここで直接 `Date.now()` を
 * 呼ばないのは、偽の時計を差し込んでテストできるようにするため。
 */
export function createEventSink(
  publish: (view: SessionView) => void,
  publishTurnStatus: (status: TurnStatusSnapshot) => void,
  publishPendingAnswer: (pending: PendingAsk | undefined) => void,
  setCommands: (commands: readonly CommandDescription[]) => void,
  onSessionEnded: (reason: string) => void,
  now: () => number,
): (event: SessionEvent) => void {
  let view = INITIAL_SESSION_VIEW
  let turnStartedAt: number | undefined = undefined
  let turnFinishedAt: number | undefined = undefined
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
    const eventNow = now()
    const next = applySessionEvent(view, event, eventNow)
    if (event.kind === "request") {
      turnStartedAt = eventNow
      turnFinishedAt = undefined
    }
    if (event.kind === "turn-finished" || event.kind === "session-ended") {
      turnFinishedAt = eventNow
    }
    if (next.turnInProgress !== view.turnInProgress) {
      publishTurnStatus({ turnStartedAt, turnFinishedAt })
    }
    if (next.pending[0]?.id !== view.pending[0]?.id) {
      publishPendingAnswer(next.pending[0])
    }
    view = next
    setCommands(commandSuggestions(view))
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
