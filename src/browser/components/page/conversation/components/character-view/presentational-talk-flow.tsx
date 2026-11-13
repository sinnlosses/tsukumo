// 舞台のやり取りの流れの器。利用者の依頼・補足は右寄せ、キャラクターのセリフは左寄せで、古い→新しいを上→下に並べる。
// 中身は下に寄せ、溢れた古い行は上へ押し出して薄れさせる（`stage/talk-flow.css`）。
// 行が `MORE_THRESHOLD` 件以上あるときだけ、上端に「これまでのやり取り」の札を出してセリフのログを開く。
// 段を終えたセリフの行だけが狐火を持ち、押すと紙のその段へ移るボタンになる。ほかの行は押せない。
// 流れが空でも器は残す（段の高さ配分を変えない）。

import type { ReactElement, ReactNode } from "react"

import { Lamp } from "../../../../ui/lamp/lamp.tsx"
import type { StepJumpTarget } from "../../stores/step-jump.ts"
import styles from "./character-view.module.css"
import type { TalkFlowRow } from "./domain/talk-flow.ts"

/** 札を出す行の数。見本の `.more` が隠れる条件（3行以下）と同じ。 */
const MORE_THRESHOLD = 4

/** 利用者の行の頭に出す名前の既定（パックが呼び名を持たないとき）。 */
const DEFAULT_CALLER = "あなた"

type PresentationalTalkFlowProps = {
  readonly rows: readonly TalkFlowRow[]
  readonly onOpenSpeechLog: () => void
  /** 段を終えたセリフの行を押したとき。 */
  readonly onJumpToStep: (target: StepJumpTarget) => void
}

export function PresentationalTalkFlow(props: PresentationalTalkFlowProps): ReactElement {
  return (
    <div className={styles["talk-flow-wrap"]}>
      {props.rows.length >= MORE_THRESHOLD && (
        <button type="button" className={styles["talk-flow-more"]} onClick={props.onOpenSpeechLog}>
          ▴ これまでのやり取り
        </button>
      )}
      <div className={styles["talk-flow"]} aria-label="この依頼でのやり取り">
        {props.rows.map((row) => (
          <TalkFlowLine key={row.key} row={row} onJumpToStep={props.onJumpToStep} />
        ))}
      </div>
    </div>
  )
}

function TalkFlowLine(props: {
  readonly row: TalkFlowRow
  readonly onJumpToStep: (target: StepJumpTarget) => void
}): ReactElement {
  const { row } = props
  if (row.kind === "you") {
    return (
      <p className={styles["talk-flow-line"]} data-who="you">
        <span className={styles["talk-flow-caller"]}>{row.caller ?? DEFAULT_CALLER}</span>
        {row.text}
      </p>
    )
  }
  const time: ReactNode = row.time.kind === "known" && (
    <time className={styles["talk-flow-time"]} dateTime={row.time.dateTime}>
      {row.time.text}
    </time>
  )
  const { finishedStep } = row
  if (finishedStep.kind === "none") {
    return (
      <p className={styles["talk-flow-line"]} data-who="her">
        {time}
        {row.text}
      </p>
    )
  }
  return (
    <button
      type="button"
      className={styles["talk-flow-line"]}
      data-who="her"
      title="紙のこの段へ移る"
      onClick={() => {
        props.onJumpToStep({ turnId: finishedStep.turnId, stepId: finishedStep.stepId })
      }}
    >
      {time}
      <span className={styles["talk-flow-lamp"]}>
        <Lamp kind="step" state="done" sizePx={14} />
      </span>
      {row.text}
    </button>
  )
}
