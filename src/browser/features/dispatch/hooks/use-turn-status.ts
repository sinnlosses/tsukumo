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

import { useEffect, useState } from "react"

import { type TurnProgress } from "../../../../shared/session-state.ts"
import { formatElapsed } from "../../../domain/elapsed-time.ts"
import { useQuestionAnswer } from "../../../stores/question-answer.tsx"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"
import { nowEpochMilliseconds } from "../../../utils/clock.ts"

const SEND_LABEL = "送信"
/** 答え待ちの質問があるあいだの送るボタンの字（最後の1問なら「答える」、手前なら「次へ」）。 */
const ANSWER_LABEL = "答える"
const NEXT_LABEL = "次へ"
const INTERRUPT_LABEL = "中断"
const ELAPSED_LABEL = "経過"
const FINISHED_LABEL = "所要"
const TICK_INTERVAL_MS = 1000

/**
 * 押せる口。**送信と中断は同時に出さない**ので、どちらか1つに畳んでから presenter へ渡す
 * （presenter は `kind` で出し分けて置くだけ）。
 */
export type TurnStatusAction =
  | { readonly kind: "send"; readonly label: string }
  | { readonly kind: "interrupt"; readonly label: string; readonly onInterrupt: () => void }

/** `<TurnStatus>` が画面に出す形。 */
export type TurnStatusModel = {
  /** 経過時間に添える字（進行中は「経過」、終わったあとは「所要」）。 */
  readonly elapsedLabel: string
  /** 経過（進行中）・所要（終わったあと）。まだ一度も依頼が無ければ `-`。 */
  readonly elapsedText: string
  readonly action: TurnStatusAction
}

export function useTurnStatus(): TurnStatusModel {
  const dispatch = useSessionDispatch()
  // 質問に答えている間は、ターンが進行中でも「中断」ではなく答えるボタンを出す
  // （SDK は答えを待って止まっているので、押す先は中断ではなく送信）。
  const question = useQuestionAnswer()
  // 姿の `turn` は**進み具合が変わったときだけ入れ替わる**ので、そのまま依存にしてよい
  // （畳み込みは変わらないフィールドの参照を持ち回る。`stores/session.tsx`）。
  const turn = useSessionSelector((session) => session.state.turn)
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
    elapsedLabel: turn.kind === "finished" ? FINISHED_LABEL : ELAPSED_LABEL,
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
  }
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
