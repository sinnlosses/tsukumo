// 失敗で止まった紙。判定の行・結論（理由の語）・続け方と残っているもの・止まった段に印を付けた計画の順に並べる。

import type { ReactElement, ReactNode } from "react"

import type { WorkPlanPaperModel } from "./hooks/use-work-plan-paper.ts"
import styles from "./main-view.module.css"
import { ChoiceButton, PLAN_LABEL, YourTurnPart } from "./your-turn-part.tsx"

const REMAINING = "残っているもの"
const REMAINING_NONE = "残っている変更は無い。"

export function PresentationalFailedPaper(props: {
  readonly model: Extract<WorkPlanPaperModel, { readonly kind: "failed" }>
  /** 判定の行。 */
  readonly stamp: ReactNode
  /** 離れていたあいだのまとめ。出さないなら `false`。 */
  readonly away: ReactNode
  /** 止まった段に印を付けた計画。 */
  readonly plan: ReactNode
}): ReactElement {
  const { model } = props
  const { retry } = model
  return (
    <section className={styles["work-plan"]} aria-label={PLAN_LABEL}>
      {props.stamp}
      {props.away}
      <p className={styles["work-plan-conclusion"]}>{model.reason}</p>
      <div className={styles["work-plan-turn"]}>
        <YourTurnPart
          onDraft={model.onDraft}
          extra={
            retry.kind !== "none" && (
              <ChoiceButton onClick={() => model.onRetry(retry.request)}>
                {retry.label}
              </ChoiceButton>
            )
          }
        />
        <section className={styles["work-plan-turn-part"]}>
          <h3 className={styles["work-plan-turn-heading"]}>{REMAINING}</h3>
          {(model.remaining.length === 0 ? [REMAINING_NONE] : model.remaining).map((line) => (
            <p key={line} className={styles["work-plan-phase-note"]}>
              {line}
            </p>
          ))}
        </section>
      </div>
      {props.plan}
    </section>
  )
}
