// 立ち絵をいま動かしてよいか、動かすなら4つのうちどれかを決める。「決める」層の純粋関数
// （`src/protocol/expression.ts` と同じ形。fs/process/document には触らない）。
//
// **動くのは利用者の注意が空いているときだけ**（docs/requirements.md 4.3、docs/design.md 6.5）。
// 読んでいる間（ターンが進行中でない間）は呼吸だけに落とし、ターンが進行中は「待っている間の
// 移動」にする。ターンが終わった直後・ツールが失敗した直後は、それぞれ一時的に「完了の反応」
// 「失敗でびくっ」を優先して返す（優先順位は {@link resolvePortraitMotion} 参照）。

/** 立ち絵がいまとる動き。CSS 側は `data-motion` としてこの値をそのまま受け取る。 */
export type PortraitMotion = "reading" | "waiting" | "success" | "failure"

/**
 * {@link resolvePortraitMotion} が要る材料。`SessionState` のうち、判定に要る3つだけを
 * 抜き出した形（`protocol/session-state.ts` にある `turnInProgress` / `turnFinishedAt` に加え、
 * ツールの失敗を拾うための `lastToolFailureAt`）。
 */
export type PortraitMotionInput = {
  readonly turnInProgress: boolean
  /** ターンが終わった時刻。終わっていない・まだ一度もターンが無ければ undefined。 */
  readonly turnFinishedAt: number | undefined
  /** 直近でツールが失敗した時刻。まだ一度も失敗していなければ undefined。 */
  readonly lastToolFailureAt: number | undefined
}

/** ツールが失敗してから、このミリ秒だけ「失敗でびくっ」を優先する。 */
export const FAILURE_MOTION_WINDOW_MS = 400

/** ターンが終わってから、このミリ秒だけ「完了の反応」を優先する。 */
export const SUCCESS_MOTION_WINDOW_MS = 700

/**
 * いま出す動き。**優先順位**: ツールが失敗した直後（{@link FAILURE_MOTION_WINDOW_MS} 以内）
 * が最優先（ターンが進行中でも、他のツールが動いていても割り込む）。次にターンが終わった
 * 直後（{@link SUCCESS_MOTION_WINDOW_MS} 以内、かつターンが進行中でない）。どちらでもなければ、
 * ターンが進行中なら「待っている間の移動」、そうでなければ「呼吸」だけの「読んでいる」。
 *
 * `now` は呼び出し側が渡す現在時刻（`Date.now()` はここでは呼ばない。`resolveExpression` と
 * 同じ理由でサーバとブラウザの結果を揃える）。
 */
export function resolvePortraitMotion(input: PortraitMotionInput, now: number): PortraitMotion {
  if (
    input.lastToolFailureAt !== undefined &&
    now - input.lastToolFailureAt < FAILURE_MOTION_WINDOW_MS
  ) {
    return "failure"
  }
  if (
    !input.turnInProgress &&
    input.turnFinishedAt !== undefined &&
    now - input.turnFinishedAt < SUCCESS_MOTION_WINDOW_MS
  ) {
    return "success"
  }
  return input.turnInProgress ? "waiting" : "reading"
}

/**
 * 「失敗でびくっ」「完了の反応」が続く残り時間のうち、いちばん早く終わるものまでの
 * ミリ秒を返す。どちらも起きていない・時間の窓をすでに過ぎているときは undefined
 * （その場合は時間経過だけで動きが変わることはない）。
 *
 * ツールの失敗・ターンの完了そのものは受け取ったイベントで再描画されるが、時間の窓が
 * 「過ぎた瞬間」には何のイベントも来ない。呼び出し側（`src/ui/character-view/character-view.tsx`
 * の `useEffect` タイマー）が、この関数の戻り値ぶん先に1回だけ自分を配り直すことで、
 * 「読んでいる」「待っている」へ戻す（`nextWorkingTransitionDelayMs` と同じ形。
 * `src/protocol/expression.ts`）。
 */
export function nextPortraitMotionTransitionDelayMs(
  input: PortraitMotionInput,
  now: number,
): number | undefined {
  const remaining = [
    input.lastToolFailureAt === undefined
      ? undefined
      : input.lastToolFailureAt + FAILURE_MOTION_WINDOW_MS - now,
    input.turnFinishedAt === undefined
      ? undefined
      : input.turnFinishedAt + SUCCESS_MOTION_WINDOW_MS - now,
  ].filter((ms): ms is number => ms !== undefined && ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
}
