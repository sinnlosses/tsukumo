// 立ち絵をいま動かしてよいか、動かすなら5つのうちどれかを決める。「決める」層の純粋関数
// （`src/shared/expression.ts` と同じ形。fs/process/document には触らない）。
//
// **動くのは利用者の注意が空いているときだけ**（docs/requirements.md 4.3、docs/design.md 6.5）。
// 読んでいる間（ターンが進行中でない間）は呼吸だけに落とし、ターンが進行中は「待っている間の
// 移動」にする。メインが `report` の引数を書いているあいだは「書いている」に替わる。
// ターンが終わった直後・ツールが失敗した直後は、それぞれ一時的に「完了の反応」「失敗でびくっ」を
// 優先して返す（優先順位は {@link resolvePortraitMotion} 参照）。**ターンが失敗で終わった直後も
// 「失敗でびくっ」**で、そのときは「完了の反応」を出さない（docs/design.md 6.5）。

import { type TurnProgress } from "./session-state.ts"

/** 立ち絵がいまとる動き。CSS 側は `data-motion` としてこの値をそのまま受け取る。 */
export type PortraitMotion = "reading" | "waiting" | "writing" | "success" | "failure"

/**
 * {@link resolvePortraitMotion} が要る材料。`SessionState` のうち、判定に要る3つだけを
 * 抜き出した形（`shared/session-state.ts` の `turn` に加え、ツールの失敗を拾うための
 * `lastToolFailureAt`、「書いている」の判定に使う `draftingReport`）。
 */
export type PortraitMotionInput = {
  /** ターンの進み具合。「待っている間の移動」と「完了の反応」の両方をここから決める。 */
  readonly turn: TurnProgress
  /** 直近でツールが失敗した時刻。まだ一度も失敗していなければ undefined。 */
  readonly lastToolFailureAt: number | undefined
  /**
   * メインがいま `report` の引数を書いているか（`SessionState.reportDrafting` が `drafting`）。
   * レポートは `report` ツールで受け取るので、`report` の外に書く本文（背景の委譲を待つ一言
   * など）は画面に出ず、「書いている」の材料にしない。
   */
  readonly draftingReport: boolean
}

/** ツールが失敗してから（ターンが失敗で終わってから）、このミリ秒だけ「失敗でびくっ」を優先する。 */
export const FAILURE_MOTION_WINDOW_MS = 400

/** ターンが（失敗でなく）終わってから、このミリ秒だけ「完了の反応」を優先する。 */
export const SUCCESS_MOTION_WINDOW_MS = 700

/**
 * いま出す動き。**優先順位**: ツールが失敗した直後・ターンが失敗で終わった直後
 * （{@link FAILURE_MOTION_WINDOW_MS} 以内）が最優先（ターンが進行中でも、他のツールが動いていても
 * 割り込む）。次にターンが失敗でなく終わった直後（{@link SUCCESS_MOTION_WINDOW_MS} 以内、かつ
 * ターンが進行中でない）。**失敗で終わったターンには「完了の反応」を出さない**（びくっのあとに
 * 跳ねると、失敗を喜んで見える）。次に、ターンが
 * 進行中で `report` の引数を書いている最中なら「書いている」。どれでもなければ、
 * ターンが進行中なら「待っている間の移動」、そうでなければ「呼吸」だけの「読んでいる」。
 *
 * `now` は呼び出し側が渡す現在時刻（エポックミリ秒。時計はここでは読まない。`resolveExpression` と
 * 同じ理由でサーバとブラウザの結果を揃える）。
 */
export function resolvePortraitMotion(input: PortraitMotionInput, now: number): PortraitMotion {
  const failedAt = lastFailureAt(input)
  if (failedAt !== undefined && now - failedAt < FAILURE_MOTION_WINDOW_MS) {
    return "failure"
  }
  if (
    input.turn.kind === "finished" &&
    input.turn.ending.kind === "ended" &&
    now - input.turn.finishedAt < SUCCESS_MOTION_WINDOW_MS
  ) {
    return "success"
  }
  if (input.turn.kind === "running" && input.draftingReport) {
    return "writing"
  }
  return input.turn.kind === "running" ? "waiting" : "reading"
}

/**
 * 「失敗でびくっ」「完了の反応」が続く残り時間のうち、いちばん早く終わるものまでの
 * ミリ秒を返す。どちらも起きていない・時間の窓をすでに過ぎているときは undefined
 * （その場合は時間経過だけで動きが変わることはない）。
 *
 * ツールの失敗・ターンの完了そのものは受け取ったイベントで再描画されるが、時間の窓が
 * 「過ぎた瞬間」には何のイベントも来ない。呼び出し側
 * （`src/browser/components/page/conversation/character-view/hooks/use-character-view.ts` の `useEffect` タイマー）が、この関数の戻り値ぶん先に1回だけ自分を配り直すことで、
 * 「読んでいる」「待っている」へ戻す（`nextWorkingTransitionDelayMs` と同じ形。
 * `src/shared/expression.ts`）。
 *
 * **`draftingReport` は受け取らない。** 「書いている」には時間の窓が無く
 * （値が変われば描画自体が {@link resolvePortraitMotion} を呼び直すので、タイマーで拾い直す
 * 理由が無い）、材料を {@link PortraitMotionInput} から2つだけへ絞ってある。
 */
export function nextPortraitMotionTransitionDelayMs(
  input: Pick<PortraitMotionInput, "turn" | "lastToolFailureAt">,
  now: number,
): number | undefined {
  const failedAt = lastFailureAt(input)
  const remaining = [
    failedAt === undefined ? undefined : failedAt + FAILURE_MOTION_WINDOW_MS - now,
    input.turn.kind === "finished" && input.turn.ending.kind === "ended"
      ? input.turn.finishedAt + SUCCESS_MOTION_WINDOW_MS - now
      : undefined,
  ].filter((ms): ms is number => ms !== undefined && ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
}

/**
 * 直近の失敗の時刻。ツールの失敗（`lastToolFailureAt`）と、失敗で終わったターンの終わった時刻の
 * うち新しいほう。どちらも無ければ undefined。
 */
function lastFailureAt(
  input: Pick<PortraitMotionInput, "turn" | "lastToolFailureAt">,
): number | undefined {
  const turnFailedAt =
    input.turn.kind === "finished" && input.turn.ending.kind === "failed"
      ? input.turn.finishedAt
      : undefined
  if (turnFailedAt === undefined) {
    return input.lastToolFailureAt
  }
  return input.lastToolFailureAt === undefined
    ? turnFailedAt
    : Math.max(turnFailedAt, input.lastToolFailureAt)
}
