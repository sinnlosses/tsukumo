// 新しい器の紙の結論の直後に置く「あなたの番」と「続けて頼めること」。
// どのボタンも押すと入力欄に下書きを足すだけで、送らない。

import { type ReactElement, use } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportProgress } from "../../../../shared/report/report-progress-field.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { buildNextSteps, type NextStepAlternative } from "../domain/next-step-plan.ts"
import type { PaperForm } from "../domain/paper-form.ts"
import type { NextStepsOrigin } from "../leaf/next-step-row.tsx"
import { ReplyPortContext } from "../reply-port.ts"
import styles from "./paper.module.css"

type PaperDraft = { readonly label: string; readonly draft: string }

export function PaperTurn(props: {
  readonly form: PaperForm
  readonly next: ReportProgress["next"]
  readonly components: readonly A2uiReportComponent[]
  readonly nextSteps?: NextStepsOrigin
}): ReactElement {
  const slot = use(ReplyPortContext)
  const steps =
    props.nextSteps === undefined
      ? []
      : buildNextSteps({ components: props.components, ...props.nextSteps })
  const alternatives = steps.flatMap((step) =>
    step.kind === "alternative" ? step.alternatives : [],
  )
  const picks: readonly PaperDraft[] = props.form === "decide" ? alternatives.map(pickOf) : []
  const continuations: readonly PaperDraft[] = [
    ...steps.flatMap((step) => (step.kind === "alternative" ? [] : [step])),
    ...(props.form === "decide"
      ? []
      : alternatives.map((option) => ({ label: `別の案: ${option.name}`, draft: option.draft }))),
  ]
  const mine = props.next.kind === "next" && props.next.owner === "you" ? props.next : undefined
  const append = slot.kind === "open" ? slot.port.appendDraft : undefined
  if (mine === undefined && picks.length === 0 && continuations.length === 0) {
    return <></>
  }
  return (
    <div className={styles["paper-turn"]}>
      {(mine !== undefined || picks.length > 0) && (
        <section className={styles["paper-turn-part"]} data-mine="true">
          <h3 className={styles["paper-turn-heading"]}>あなたの番</h3>
          {mine !== undefined && <p>{mine.action}</p>}
          {append !== undefined && (
            <DraftButtons
              drafts={[
                ...(mine?.choices ?? []).map((choice) => ({ label: choice, draft: choice })),
                ...picks,
              ]}
              tone="mine"
              append={append}
            />
          )}
        </section>
      )}
      {continuations.length > 0 && append !== undefined && (
        <section className={styles["paper-turn-part"]}>
          <h3 className={styles["paper-turn-heading"]}>続けて頼めること</h3>
          <DraftButtons drafts={continuations} tone="plain" append={append} />
          <p className={styles["paper-quiet"]}>押すと入力欄に入る。送るまでは始まらない。</p>
        </section>
      )}
    </div>
  )
}

function pickOf(option: NextStepAlternative): PaperDraft {
  return { label: `これにする: ${option.name}`, draft: option.draft }
}

function DraftButtons(props: {
  readonly drafts: readonly PaperDraft[]
  readonly tone: "mine" | "plain"
  readonly append: (text: string) => void
}): ReactElement {
  return (
    <div className={styles["paper-choices"]}>
      {props.drafts.map((draft) => (
        <Button
          key={draft.label}
          variant={props.tone === "mine" ? "outline-accent" : "outline"}
          size="secondary"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className=""
          onClick={() => props.append(draft.draft)}
        >
          {draft.label}
        </Button>
      ))}
    </div>
  )
}
