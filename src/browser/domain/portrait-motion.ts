// 立ち絵をいま動かしてよいか、動かすなら5つのうちどれかを決める。
// 動くのは利用者の注意が空いているときだけ。優先順位は `resolvePortraitMotion` が持つ。

import type { TurnProgress } from "../../shared/session/turn-progress.ts"

/** 立ち絵がいまとる動き。CSS 側は `data-motion` としてこの値をそのまま受け取る。 */
export type PortraitMotion = "reading" | "waiting" | "writing" | "success" | "failure"

/** {@link resolvePortraitMotion} が要る材料。`SessionState` のうち、判定に要る3つだけを抜き出した形。 */
export type PortraitMotionInput = {
  /** ターンの進み具合。「待っている間の移動」と「完了の反応」の両方をここから決める。 */
  readonly turn: TurnProgress
  /** 直近でツールが失敗した時刻。まだ一度も失敗していなければ undefined。 */
  readonly lastToolFailureAt?: number
  /**
   * メインがいま `report` の引数を書いているか（`SessionState.sdkTurn` の `reportDrafting` が `drafting`）。
   * `report` の外に書く本文（背景の委譲を待つ一言など）は画面に出ないので、「書いている」の材料にしない。
   */
  readonly draftingReport: boolean
  /** 背景の作業（`SessionState.backgroundTasks`）が1件でも残っているか。省くと残っていない。 */
  readonly backgroundRunning?: boolean
  /** いちばん新しいやり取りが、利用者が止めて終わったか（記録の `turn-interrupted`）。`turn` の `ending` は中断を完了と同じ `ended` に畳むので、記録から渡す。省くと止めていない。 */
  readonly interrupted?: boolean
}

type PortraitMotionTimingInput = Pick<
  PortraitMotionInput,
  "turn" | "lastToolFailureAt" | "backgroundRunning" | "interrupted"
>

/** ツールが失敗してから（ターンが失敗で終わってから）、このミリ秒だけ「失敗でびくっ」を優先する。 */
const FAILURE_MOTION_WINDOW_MS = 400

/** ターンが（失敗でなく）終わってから、このミリ秒だけ「完了の反応」を優先する。 */
const SUCCESS_MOTION_WINDOW_MS = 700

/**
 * いま出す動き。優先順位は次の順。
 *
 * 1. ツールが失敗した直後・ターンが失敗で終わった直後（{@link FAILURE_MOTION_WINDOW_MS} 以内）。ターンが進行中でも、他のツールが動いていても割り込む
 * 2. ターンが完了で終わった直後（{@link SUCCESS_MOTION_WINDOW_MS} 以内）。
 *    失敗・中断で終わったターンと、背景の作業が残っているときには「完了の反応」を出さない
 * 3. ターンが進行中で `report` の引数を書いている最中なら「書いている」
 * 4. ターンが進行中か、背景の作業を待っているあいだは「待っている間の移動」、そうでなければ「呼吸」だけの「読んでいる」
 *
 * `now` は呼び出し側が渡す現在時刻（エポックミリ秒）。時計はここでは読まない（サーバとブラウザの結果を揃える）。
 */
export function resolvePortraitMotion(input: PortraitMotionInput, now: number): PortraitMotion {
  const failedAt = lastFailureAt(input)
  if (failedAt !== undefined && now - failedAt < FAILURE_MOTION_WINDOW_MS) {
    return "failure"
  }
  if (
    isSuccessCandidate(input) &&
    input.turn.kind === "finished" &&
    now - input.turn.finishedAt < SUCCESS_MOTION_WINDOW_MS
  ) {
    return "success"
  }
  if (input.turn.kind === "running" && input.draftingReport) {
    return "writing"
  }
  return input.turn.kind === "running" || isWaitingInBackground(input) ? "waiting" : "reading"
}

/**
 * 「失敗でびくっ」「完了の反応」が続く残り時間のうち、いちばん早く終わるものまでのミリ秒を返す。
 * どちらも起きていない・期間をすでに過ぎているときは undefined（時間経過だけで動きが変わることはない）。
 *
 * 期間が「過ぎた瞬間」には何のイベントも来ない。
 * 呼び出し側はこの戻り値ぶん先に1回だけ描き直して、「読んでいる」「待っている」へ戻す。
 *
 * `draftingReport` は受け取らない（「書いている」には期間が無く、値が変われば描画自体が {@link resolvePortraitMotion} を呼び直す）。
 */
export function nextPortraitMotionTransitionDelayMs(
  input: PortraitMotionTimingInput,
  now: number,
): number | undefined {
  const failedAt = lastFailureAt(input)
  const remaining = [
    failedAt === undefined ? undefined : failedAt + FAILURE_MOTION_WINDOW_MS - now,
    isSuccessCandidate(input) && input.turn.kind === "finished"
      ? input.turn.finishedAt + SUCCESS_MOTION_WINDOW_MS - now
      : undefined,
  ].filter((ms): ms is number => ms !== undefined && ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
}

/** 閉じていて、背景の作業も残っておらず、利用者が止めずに完了で終わったか。跳ねるのはこのときだけ。 */
function isSuccessCandidate(input: PortraitMotionTimingInput): boolean {
  return (
    input.turn.kind === "finished" &&
    input.turn.ending.kind === "ended" &&
    input.backgroundRunning !== true &&
    input.interrupted !== true
  )
}

/** ターンは閉じているが背景の作業が残っているあいだ（失敗・中断のあとは歩かない）。 */
function isWaitingInBackground(input: PortraitMotionTimingInput): boolean {
  return (
    input.backgroundRunning === true &&
    input.interrupted !== true &&
    !(input.turn.kind === "finished" && input.turn.ending.kind === "failed")
  )
}

/** 直近の失敗の時刻。ツールの失敗（`lastToolFailureAt`）と、失敗で終わったターンの終わった時刻のうち新しいほう。どちらも無ければ undefined。 */
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
