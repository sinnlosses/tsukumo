// 止まった紙の「あなたの番」。続け方の並びを止まり方によらず1か所で持つ。

import type { ReactElement, ReactNode } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { STOPPED_CHOICES } from "./hooks/use-work-plan-paper.ts"
import styles from "./main-view.module.css"

export const PLAN_LABEL = "ワークプラン"
const YOUR_TURN = "あなたの番"

export function YourTurnPart(props: {
  readonly onDraft: (draft: string) => void
  /** 続け方の並びの後ろに足すボタン。 */
  readonly extra: ReactNode
}): ReactElement {
  return (
    <section className={styles["work-plan-turn-part"]} data-mine="true">
      <h3 className={styles["work-plan-turn-heading"]}>{YOUR_TURN}</h3>
      <div className={styles["work-plan-choices"]}>
        {STOPPED_CHOICES.map((choice) => (
          <ChoiceButton key={choice.key} onClick={() => props.onDraft(choice.draft)}>
            <kbd className={styles["work-plan-choice-key"]}>{choice.key}</kbd>
            {choice.label}
          </ChoiceButton>
        ))}
        {props.extra}
      </div>
    </section>
  )
}

export function ChoiceButton(props: {
  readonly onClick: () => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <Button
      variant="outline-accent"
      size="secondary"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className=""
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}
