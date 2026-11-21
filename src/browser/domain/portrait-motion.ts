// 立ち絵をいま動かしてよいか、動かすなら11のうちどれかを決める。
// 動くのは利用者の注意が空いているときだけ。優先順位は `resolvePortraitMotion` が持つ。

import type { SessionRecord } from "../../shared/session/session-record.ts"
import type { TurnProgress } from "../../shared/session/turn-progress.ts"

/** 立ち絵がいまとる動き。CSS 側は `data-motion` としてこの値をそのまま受け取る。 */
export type PortraitMotion =
  | "reading"
  | "waiting"
  | "writing"
  | "success"
  | "celebrate"
  | "failure"
  | "beckon"
  | "nod"
  | "lean"
  | "tilt"
  | "sink"

/** 声が届いた瞬間に掛ける1回の動き。 */
export type ArrivalMotion = "nod" | "lean" | "tilt" | "sink" | "success" | "failure"

/** タブの見え隠れ。`returned` は隠れていたタブが見えるようになった時刻を持つ。 */
export type TabVisibility =
  | { readonly kind: "visible" }
  | { readonly kind: "hidden" }
  | { readonly kind: "returned"; readonly at: number }

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
  /** 答え待ち（質問・許可）の最初の1件が届いた時刻。答え待ちが無ければ省く。 */
  readonly askedAt?: number
  /** タブの見え隠れ。省くと見えている。 */
  readonly tab?: TabVisibility
  /** このタブが依頼・補足・答えを送る操作をした時刻。省くと送っていない。 */
  readonly sentAt?: number
  /** 声が届いた時刻と、そのとき掛ける動き。届いていない・動かない表情なら省く。 */
  readonly arrival?: { readonly at: number; readonly motion: ArrivalMotion }
  /** 動きを減らす設定か。省くと減らさない。 */
  readonly reducedMotion?: boolean
  /** いちばん新しいやり取りが、検証を通したタスクの完了で終わったか（{@link newestTurnFinishedTask}）。省くと当たらない。 */
  readonly taskFinished?: boolean
}

type PortraitMotionTimingInput = Pick<
  PortraitMotionInput,
  | "turn"
  | "lastToolFailureAt"
  | "backgroundRunning"
  | "interrupted"
  | "askedAt"
  | "tab"
  | "sentAt"
  | "arrival"
  | "reducedMotion"
  | "taskFinished"
>

/** 答え待ちが始まってから（隠れていたタブが見えるようになってから）、このミリ秒だけ「呼ぶ」を優先する。 */
const BECKON_MOTION_WINDOW_MS = 10_800

/** 送る操作をしてから、このミリ秒だけ「うなずく」を優先する。 */
const NOD_MOTION_WINDOW_MS = 500

/** ツールが失敗してから（ターンが失敗で終わってから）、このミリ秒だけ「失敗でびくっ」を優先する。 */
const FAILURE_MOTION_WINDOW_MS = 400

/** ターンが（失敗でなく）終わってから、このミリ秒だけ「完了の反応」を優先する。 */
const SUCCESS_MOTION_WINDOW_MS = 700

/** タスクの作業が完了で終わってから、このミリ秒だけ「祝う」を優先する。光（1.1 秒）より短くしない。 */
const CELEBRATE_MOTION_WINDOW_MS = 1300

/** 届いた瞬間の動きごとに優先する期間（ミリ秒）。動きの長さより長く取る。 */
const ARRIVAL_MOTION_WINDOW_MS = {
  nod: NOD_MOTION_WINDOW_MS,
  lean: 900,
  tilt: 900,
  sink: 1100,
  success: SUCCESS_MOTION_WINDOW_MS,
  failure: FAILURE_MOTION_WINDOW_MS,
} as const satisfies Record<ArrivalMotion, number>

/**
 * いま出す動き。優先順位は次の順。
 *
 * 1. ツールが失敗した直後・ターンが失敗で終わった直後（{@link FAILURE_MOTION_WINDOW_MS} 以内）。ターンが進行中でも、他のツールが動いていても割り込む
 * 2. ターンが完了で終わった直後。タスクの作業の完了（`taskFinished`）なら「祝う」（{@link CELEBRATE_MOTION_WINDOW_MS} 以内。動きを減らす設定では出さず「跳ねる」）、
 *    そうでなければ「跳ねる」（{@link SUCCESS_MOTION_WINDOW_MS} 以内）。
 *    失敗・中断で終わったターンと、背景の作業が残っているときには「完了の反応」を出さない
 * 3. 答え待ちが始まった直後・隠れていたタブが見えるようになった直後（{@link BECKON_MOTION_WINDOW_MS} 以内）は「呼ぶ」。
 *    タブが隠れているあいだと、動きを減らす設定では出さない
 * 4. 声が届いた直後（動きごとの {@link ARRIVAL_MOTION_WINDOW_MS} 以内）は、その動き。動きを減らす設定では出さない
 * 5. 送る操作の直後（{@link NOD_MOTION_WINDOW_MS} 以内）は「うなずく」。動きを減らす設定では出さない
 * 6. 答え待ちのあいだは、ターンが進行中でも「呼吸」だけの「読んでいる」
 * 7. ターンが進行中で `report` の引数を書いている最中なら「書いている」
 * 8. ターンが進行中か、背景の作業を待っているあいだは「待っている間の移動」、そうでなければ「呼吸」だけの「読んでいる」
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
    now - input.turn.finishedAt < finishedWindow(input).durationMs
  ) {
    return finishedWindow(input).motion
  }
  const reaction = reactionWindows(input).find((w) => now - w.startedAt < w.durationMs)
  if (reaction !== undefined) {
    return reaction.motion
  }
  if (input.askedAt !== undefined) {
    return "reading"
  }
  if (input.turn.kind === "running" && input.draftingReport) {
    return "writing"
  }
  return input.turn.kind === "running" || isWaitingInBackground(input) ? "waiting" : "reading"
}

/**
 * 「失敗でびくっ」「祝う・跳ねる」「呼ぶ」「届いた瞬間の動き」「うなずく」が続く残り時間のうち、いちばん早く終わるものまでのミリ秒を返す。
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
      ? input.turn.finishedAt + finishedWindow(input).durationMs - now
      : undefined,
    ...reactionWindows(input).map((w) => w.startedAt + w.durationMs - now),
  ].filter((ms): ms is number => ms !== undefined && ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
}

/** ターンの終わり方に添える漫符。完了の星・失敗の稲妻と影・答え待ちの「？」。 */
export type EndingManpu = "stars" | "shock" | "ask"

export type EndingManpuShown =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly manpu: EndingManpu; readonly at: number }

/** 終わり方のエフェクトを出す窓（ミリ秒）。いちばん長い答え待ちの札（1.8 秒）より長く取り、開き直した画面で古い終わり方を再生しない。 */
const ENDING_MANPU_WINDOW_MS = 3000

/**
 * 終わり方の漫符（完了・失敗・答え待ち）。出す窓の中にあるもののうち、いちばん新しいもの1つ。
 * `at` は再生の起点で、呼ぶ側が `key` にして1回だけ再生させる。動きを減らす設定では出さない。
 *
 * 失敗は {@link lastFailureAt}（ツールの失敗・失敗で終わったターン）だけ。声が届いた瞬間の `failure`（あわわ）は材料に入れない。
 * 完了は「祝う」と同じ条件（タスクの完了で、背景の作業が残らず、止めずに終わった）。
 * 答え待ちは「呼ぶ」と同じ契機（始まった直後・隠れていたタブが見えるようになった直後）で、隠れているあいだは出さない。
 */
export function endingManpuOf(input: PortraitMotionTimingInput, now: number): EndingManpuShown {
  if (input.reducedMotion === true) {
    return { kind: "none" }
  }
  const failedAt = lastFailureAt(input)
  const candidates: readonly { readonly manpu: EndingManpu; readonly at: number }[] = [
    ...(failedAt === undefined ? [] : [{ manpu: "shock" as const, at: failedAt }]),
    ...(input.taskFinished === true && isSuccessCandidate(input) && input.turn.kind === "finished"
      ? [{ manpu: "stars" as const, at: input.turn.finishedAt }]
      : []),
    ...(input.askedAt === undefined || input.tab?.kind === "hidden"
      ? []
      : [
          {
            manpu: "ask" as const,
            at:
              input.tab?.kind === "returned" && input.tab.at > input.askedAt
                ? input.tab.at
                : input.askedAt,
          },
        ]),
  ].filter((c) => now - c.at < ENDING_MANPU_WINDOW_MS)
  const [latest] = candidates.toSorted((a, b) => b.at - a.at)
  return latest === undefined ? { kind: "none" } : { kind: "shown", ...latest }
}

/** 続く動き（歩く・呼吸・書く）。これだけが聞く姿勢に替わってよい。 */
const CONTINUING_MOTIONS = [
  "reading",
  "waiting",
  "writing",
] as const satisfies readonly PortraitMotion[]

/**
 * 立ち絵が聞く姿勢（`data-listening`）を取るか。
 * 入力欄に字があるあいだだけ取り、フォーカスだけでは取らない。
 * 1回の動き（びくっ・祝う・跳ねる・呼ぶ・出方・うなずく）の最中は取らず、終わって続く動きへ戻ってから取る。
 * 動きを減らす設定では、傾きが変わる瞬間が動きに見えるので取らない。
 */
export function isListeningPose(
  motion: PortraitMotion,
  draftHasText: boolean,
  reducedMotion: boolean,
): boolean {
  return draftHasText && !reducedMotion && CONTINUING_MOTIONS.some((m) => m === motion)
}

/**
 * いちばん新しいやり取り（最後の `request` より後ろ）の最後の `report` が、検証を通したタスクの完了か。
 * `task.outcome` が `finished` で、`checks` に `ng` が無いときだけ真。`unobserved`・`blocked` は偽にしない。
 */
export function newestTurnFinishedTask(records: readonly SessionRecord[]): boolean {
  const newest = records.slice(records.findLastIndex((r) => r.kind === "request") + 1)
  const report = newest.findLast((r) => r.kind === "report")
  return (
    report !== undefined &&
    report.task.kind === "task" &&
    report.task.outcome === "finished" &&
    report.checks.every((check) => check.status !== "ng")
  )
}

type ReactionWindow = {
  readonly motion: "beckon" | ArrivalMotion
  readonly startedAt: number
  readonly durationMs: number
}

/**
 * 呼ぶ・届いた瞬間の動き・うなずくの窓を、優先の順に並べる。出せないもの（答え待ちが無い・届いていない・送っていない・
 * 呼ぶはタブが隠れているあいだ・動きを減らす設定）は入れない。
 */
function reactionWindows(input: PortraitMotionTimingInput): readonly ReactionWindow[] {
  if (input.reducedMotion === true) {
    return []
  }
  const beckon: readonly ReactionWindow[] =
    input.askedAt === undefined || input.tab?.kind === "hidden"
      ? []
      : [
          {
            motion: "beckon",
            startedAt:
              input.tab?.kind === "returned" && input.tab.at > input.askedAt
                ? input.tab.at
                : input.askedAt,
            durationMs: BECKON_MOTION_WINDOW_MS,
          },
        ]
  const arrived: readonly ReactionWindow[] =
    input.arrival === undefined
      ? []
      : [
          {
            motion: input.arrival.motion,
            startedAt: input.arrival.at,
            durationMs: ARRIVAL_MOTION_WINDOW_MS[input.arrival.motion],
          },
        ]
  const nod: readonly ReactionWindow[] =
    input.sentAt === undefined
      ? []
      : [{ motion: "nod", startedAt: input.sentAt, durationMs: NOD_MOTION_WINDOW_MS }]
  return [...beckon, ...arrived, ...nod]
}

/** 完了の反応の動きと窓。タスクの完了は祝う（動きを減らす設定では跳ねる）。 */
function finishedWindow(input: PortraitMotionTimingInput): {
  readonly motion: "celebrate" | "success"
  readonly durationMs: number
} {
  return input.taskFinished === true && input.reducedMotion !== true
    ? { motion: "celebrate", durationMs: CELEBRATE_MOTION_WINDOW_MS }
    : { motion: "success", durationMs: SUCCESS_MOTION_WINDOW_MS }
}

/** 閉じていて、背景の作業も残っておらず、利用者が止めずに完了で終わったか。祝う・跳ねるのはこのときだけ。 */
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
