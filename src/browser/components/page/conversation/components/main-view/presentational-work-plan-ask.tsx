// 問いが生まれた段に出す、問いと材料の行。答える場所は入力欄だけなので、ボタンは置かない。

import type { ReactElement } from "react"

import type { WorkPlanAsk } from "../../domain/work-plan-ask-row.ts"
import styles from "./main-view.module.css"

export const ASK_TAG = "あなたの番"
const ASK_QUESTION = "問い"
const ASK_MATERIAL = "材料"
const ASK_ANSWER_AT = "答えは下の入力欄で"

export function WorkPlanAskBlock(props: {
  readonly ask: Extract<WorkPlanAsk, { readonly kind: "asked" }>
}): ReactElement {
  const { ask } = props
  return (
    <div className={styles["work-plan-live"]} data-kind="ask">
      <div className={styles["work-plan-act"]} data-kind="ask-question">
        <span className={styles["work-plan-act-kind"]}>{ASK_QUESTION}</span>
        <span>{ask.question}</span>
        <span className={styles["work-plan-act-when"]}>{ASK_ANSWER_AT}</span>
      </div>
      {ask.material !== "" && (
        <div className={styles["work-plan-act"]} data-kind="ask-material">
          <span className={styles["work-plan-act-kind"]}>{ASK_MATERIAL}</span>
          <span>{ask.material}</span>
          <span />
        </div>
      )}
    </div>
  )
}
