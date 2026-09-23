// 送信⇄中断のボタンと経過/所要の表示（<TurnStatus>。docs/design.md 6.1）。**`<Composer>` の
// `<form>` の中に置く**ことを前提にする — 進行中でなければ `type="submit"` なので、押すと
// Composer の `onSubmit` がそのまま依頼を送る。進行中は `type="button"` にして、ここが直接
// `interrupt` を dispatch する（送信と中断が同時に押せる状態を作らないためのもの）。
//
// 経過時間は `state.turn` が持つ始まった時刻から数え、終わっていればその時刻で止まる
// （**1秒の刻みはここのローカルなタイマー**。`SessionState` に秒数は持たない。docs/design.md
// 4.2 / 6.2）。

import { useEffect, useState, type ReactElement } from "react"

import { type TurnProgress } from "../../../shared/session-state.ts"
import { useQuestionAnswer } from "../../stores/question-answer.tsx"
import { useSessionDispatch, useSessionSelector } from "../../stores/session.tsx"
import { nowEpochMilliseconds } from "../../utils/clock.ts"
import styles from "./dispatch.module.css"

const SEND_LABEL = "送信"
/** 答え待ちの質問があるあいだの送るボタンの字（最後の1問なら「答える」、手前なら「次へ」）。 */
const ANSWER_LABEL = "答える"
const NEXT_LABEL = "次へ"
const INTERRUPT_LABEL = "中断"
const ELAPSED_LABEL = "経過"
const FINISHED_LABEL = "所要"
const SEND_SHORTCUT_HINT = "⌘⏎"
const TICK_INTERVAL_MS = 1000

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

/** 秒数を表示用の文字列にする（60秒未満は `N秒`、以降は `M分SS秒`）。 */
function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}秒`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}分${String(seconds).padStart(2, "0")}秒`
}

export function TurnStatus(): ReactElement {
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

  const elapsedLabel = turn.kind === "finished" ? FINISHED_LABEL : ELAPSED_LABEL

  return (
    <div className={styles["dispatch-row"]}>
      <span className={styles["dispatch-elapsed-row"]}>
        <span>{elapsedLabel}</span>{" "}
        <span className={styles["dispatch-elapsed"]}>{elapsedText(turn, now)}</span>
      </span>
      {turn.kind === "running" && question.kind !== "asking" ? (
        <button
          type="button"
          className={styles["dispatch-interrupt"]}
          onClick={() => dispatch({ type: "interrupt" })}
        >
          {INTERRUPT_LABEL}
        </button>
      ) : (
        <button
          type="submit"
          className={styles["dispatch-send"]}
          data-shortcut={SEND_SHORTCUT_HINT}
        >
          {question.kind === "asking" ? (question.last ? ANSWER_LABEL : NEXT_LABEL) : SEND_LABEL}
        </button>
      )}
    </div>
  )
}
