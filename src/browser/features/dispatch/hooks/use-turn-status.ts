// `<TurnStatus>` のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 経過時間の刻みと、送信⇄中断のどちらを出すかを**畳んだ値**にして返す。
//
// 経過時間は `state.turn` が持つ始まった時刻から数え、終わっていればその時刻で止まる
// （**1秒の刻みはここのローカルなタイマー**。`SessionState` に秒数は持たない。docs/design.md
// 4.2 / 6.2）。
//
// **押す先を決めるのもここ。** 進行中でなければ `type="submit"` で、押すと `<Composer>` の
// `onSubmit` がそのまま依頼を送る（この部品は `<form>` の中に置かれることを前提にする）。
// 進行中は `interrupt` を dispatch する `type="button"` にして、送信と中断が同時に押せる状態を
// 作らない。
//
// **API の知らせ（再試行中・利用上限・失敗の理由）もこの行に出す**（docs/display.md 4.2「入力欄」）。
// 出すのは1つだけで、強いほうを選ぶ（{@link turnStatusNotice}）。失敗で終わったターンは経過時間の
// 字も「所要」から「失敗」に変える（色だけで伝えない）。

import { useEffect, useState } from "react"

import { type ApiTrouble } from "../../../../shared/api-trouble.ts"
import { type RateLimit, type RateLimitBucket } from "../../../../shared/rate-limit.ts"
import { type TurnProgress } from "../../../../shared/session-state.ts"
import { apiErrorLabel, turnFailureLabel } from "../../../domain/api-error-label.ts"
import { formatElapsed } from "../../../domain/elapsed-time.ts"
import { useQuestionAnswer } from "../../../stores/question-answer.tsx"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"
import {
  clockTime,
  localTimeZoneId,
  nowEpochMilliseconds,
  zonedDateTime,
} from "../../../utils/clock.ts"

const SEND_LABEL = "送信"
/** 答え待ちの質問があるあいだの送るボタンの字（最後の1問なら「答える」、手前なら「次へ」）。 */
const ANSWER_LABEL = "答える"
const NEXT_LABEL = "次へ"
const INTERRUPT_LABEL = "中断"
const ELAPSED_LABEL = "経過"
const FINISHED_LABEL = "所要"
/** 失敗で終わったターンの経過時間に添える字（「所要」の代わり。docs/display.md 4.2「入力欄」）。 */
const FAILED_LABEL = "失敗"
const TICK_INTERVAL_MS = 1000

/**
 * 押せる口。**送信と中断は同時に出さない**ので、どちらか1つに畳んでから presenter へ渡す
 * （presenter は `kind` で出し分けて置くだけ）。
 */
export type TurnStatusAction =
  | { readonly kind: "send"; readonly label: string }
  | { readonly kind: "interrupt"; readonly label: string; readonly onInterrupt: () => void }

/**
 * 経過時間の行に添える API の知らせ（再試行中・利用上限・失敗の理由）。`label` は行に出す短い
 * 字、`detail` は `title` で読ませる全文。`tone` は枠と字の色（`warn` は続く・まだ使える、`ng` は
 * 止まった・使えない）で、**色だけでは伝えない**（`label` が字で言う）。
 */
export type TurnStatusNotice =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly tone: "warn" | "ng"
      readonly label: string
      readonly detail: string
    }

/** `<TurnStatus>` が画面に出す形。 */
export type TurnStatusModel = {
  /** 経過時間に添える字（進行中は「経過」、終わったあとは「所要」、失敗で終わったら「失敗」）。 */
  readonly elapsedLabel: string
  /** 経過（進行中）・所要（終わったあと）。まだ一度も依頼が無ければ `-`。 */
  readonly elapsedText: string
  readonly action: TurnStatusAction
  readonly notice: TurnStatusNotice
}

/** 利用上限の枠の語。`other` は枠の名前を出さない（空）。 */
const RATE_LIMIT_BUCKET_LABEL = {
  "five-hour": "5時間枠",
  "seven-day": "7日間枠",
  "seven-day-opus": "7日間枠（Opus）",
  "seven-day-sonnet": "7日間枠（Sonnet）",
  overage: "超過利用枠",
  other: "",
} satisfies Record<RateLimitBucket, string>

export function useTurnStatus(): TurnStatusModel {
  const dispatch = useSessionDispatch()
  // 質問に答えている間は、ターンが進行中でも「中断」ではなく答えるボタンを出す
  // （SDK は答えを待って止まっているので、押す先は中断ではなく送信）。
  const question = useQuestionAnswer()
  // 姿の `turn` は**進み具合が変わったときだけ入れ替わる**ので、そのまま依存にしてよい
  // （畳み込みは変わらないフィールドの参照を持ち回る。`stores/session.tsx`）。
  const turn = useSessionSelector((session) => session.state.turn)
  const apiTrouble = useSessionSelector((session) => session.state.apiTrouble)
  const rateLimit = useSessionSelector((session) => session.state.rateLimit)
  const [now, setNow] = useState(() => nowEpochMilliseconds())

  // 進行中の間だけ1秒ごとに刻む。終わったら止める（終わった時刻で経過時間が固定されるので、
  // タイマーは要らない）。
  useEffect(() => {
    if (turn.kind !== "running") {
      return undefined
    }
    const timer = setInterval(() => setNow(nowEpochMilliseconds()), TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [turn])

  return {
    elapsedLabel:
      turn.kind === "finished"
        ? turn.ending.kind === "failed"
          ? FAILED_LABEL
          : FINISHED_LABEL
        : ELAPSED_LABEL,
    elapsedText: elapsedText(turn, now),
    action:
      turn.kind === "running" && question.kind !== "asking"
        ? {
            kind: "interrupt",
            label: INTERRUPT_LABEL,
            onInterrupt: () => dispatch({ type: "interrupt" }),
          }
        : {
            kind: "send",
            label: sendLabel(question.kind === "asking" ? question.last : undefined),
          },
    notice: turnStatusNotice(turn, apiTrouble, rateLimit, now),
  }
}

/**
 * 行に出す API の知らせ。**強い順に1つだけ**: 進行中の再試行 → 利用上限に達した → 失敗で
 * 終わったターンの理由 → 利用上限が近い。利用上限は戻る時刻を過ぎても次の知らせが来るまで
 * 出し続ける（戻ったかどうかは tsukumo からは分からず、次に API を呼んだときの知らせで消える）。
 */
function turnStatusNotice(
  turn: TurnProgress,
  apiTrouble: ApiTrouble,
  rateLimit: RateLimit,
  now: number,
): TurnStatusNotice {
  if (turn.kind === "running" && apiTrouble.kind === "retrying") {
    const status =
      apiTrouble.errorStatus === undefined ? "応答なし" : String(apiTrouble.errorStatus)
    const seconds = Math.max(1, Math.round(apiTrouble.retryDelayMs / 1000))
    return {
      kind: "shown",
      tone: "warn",
      label: `再試行中 ${String(apiTrouble.attempt)}/${String(apiTrouble.maxRetries)}`,
      detail: `${apiErrorLabel(apiTrouble.error)}（${status}）。${String(seconds)}秒おいて呼び直す`,
    }
  }
  if (rateLimit.kind === "rejected") {
    return rateLimitNotice(rateLimit, now)
  }
  if (turn.kind === "finished" && turn.ending.kind === "failed") {
    const reason = turnFailureLabel(turn.ending.failure)
    return { kind: "shown", tone: "ng", label: reason, detail: `失敗で終わった: ${reason}` }
  }
  return rateLimit.kind === "warning" ? rateLimitNotice(rateLimit, now) : { kind: "none" }
}

function rateLimitNotice(
  rateLimit: Extract<RateLimit, { readonly kind: "warning" | "rejected" }>,
  now: number,
): TurnStatusNotice {
  const bucketLabel = RATE_LIMIT_BUCKET_LABEL[rateLimit.bucket]
  const subject = bucketLabel === "" ? "利用上限" : `${bucketLabel}の利用上限`
  const resetText =
    rateLimit.resetsAt === undefined ? undefined : resetTimeText(rateLimit.resetsAt, now)
  const rejected = rateLimit.kind === "rejected"
  const state = rejected ? `${subject}に達した` : `${subject}が近い`
  return {
    kind: "shown",
    tone: rejected ? "ng" : "warn",
    label: rejected
      ? resetText === undefined
        ? "利用上限"
        : `利用上限 ${resetText}まで`
      : "利用上限が近い",
    detail: resetText === undefined ? state : `${state}。${resetText}に戻る`,
  }
}

/** 戻る時刻の字。今日なら `HH:MM`、別の日なら `M/D HH:MM`（読む人のタイムゾーンで）。 */
function resetTimeText(resetsAt: number, now: number): string {
  const timeZone = localTimeZoneId()
  const at = zonedDateTime(resetsAt, timeZone)
  const today = zonedDateTime(now, timeZone)
  return at.toPlainDate().equals(today.toPlainDate())
    ? clockTime(at)
    : `${String(at.month)}/${String(at.day)} ${clockTime(at)}`
}

/**
 * 送るボタンの字。答え待ちの質問が無ければ「送信」、あれば最後の1問だけ「答える」で手前は
 * 「次へ」。
 */
function sendLabel(lastQuestion: boolean | undefined): string {
  if (lastQuestion === undefined) {
    return SEND_LABEL
  }
  return lastQuestion ? ANSWER_LABEL : NEXT_LABEL
}

/**
 * 経過（進行中）・所要（終わったあと）として出す文字列。まだ一度も依頼が無ければ `-`。
 * `now` を使うのは進行中のときだけで、終わったターンは終わった時刻で固定される。
 */
function elapsedText(turn: TurnProgress, now: number): string {
  if (turn.kind === "idle") {
    return "-"
  }
  const until = turn.kind === "finished" ? turn.finishedAt : now
  return formatElapsed(Math.max(0, Math.floor((until - turn.startedAt) / 1000)))
}
