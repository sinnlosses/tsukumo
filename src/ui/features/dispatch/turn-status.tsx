// 送信⇄中断のボタンと経過/所要の表示（<TurnStatus>。docs/design.md 6.1）。**`<Composer>` の
// `<form>` の中に置く**ことを前提にする — 進行中でなければ `type="submit"` なので、押すと
// Composer の `onSubmit` がそのまま依頼を送る。進行中は `type="button"` にして、ここが直接
// `interrupt` を dispatch する（送信と中断が同時に押せる状態を作らないためのもの）。
//
// 経過時間は `state.turnStartedAt` から数え、`state.turnFinishedAt` があればそこで止まる
// （**1秒の刻みはここのローカルなタイマー**。`SessionState` に秒数は持たない。docs/design.md
// 4.2 / 6.2）。

import { useEffect, useState, type ReactElement } from "react"

import { useSession } from "../../stores/session.tsx"

const SEND_LABEL = "送信"
const INTERRUPT_LABEL = "中断"
const ELAPSED_LABEL = "経過"
const FINISHED_LABEL = "所要"
const SEND_SHORTCUT_HINT = "⌘⏎"
const TICK_INTERVAL_MS = 1000

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
  const { state, dispatch } = useSession()
  const [now, setNow] = useState(() => Date.now())

  // 進行中（開始していて、まだ終わっていない）間だけ1秒ごとに刻む。終わったら止める
  // （turnFinishedAt の値で経過時間が固定されるので、タイマーは要らない）。
  useEffect(() => {
    if (state.turnStartedAt === undefined || state.turnFinishedAt !== undefined) {
      return undefined
    }
    const timer = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [state.turnStartedAt, state.turnFinishedAt])

  const elapsedText =
    state.turnStartedAt === undefined
      ? "-"
      : formatElapsed(
          Math.max(0, Math.floor(((state.turnFinishedAt ?? now) - state.turnStartedAt) / 1000)),
        )
  const elapsedLabel = state.turnFinishedAt === undefined ? ELAPSED_LABEL : FINISHED_LABEL

  return (
    <div className="dispatch-row">
      {state.turnInProgress ? (
        <button
          type="button"
          className="dispatch-send"
          onClick={() => dispatch({ type: "interrupt" })}
        >
          {INTERRUPT_LABEL}
        </button>
      ) : (
        <button type="submit" className="dispatch-send" data-shortcut={SEND_SHORTCUT_HINT}>
          {SEND_LABEL}
        </button>
      )}
      <span className="dispatch-elapsed-row">
        <span className="dispatch-elapsed-label">{elapsedLabel}</span>:{" "}
        <span className="dispatch-elapsed">{elapsedText}</span>
      </span>
    </div>
  )
}
