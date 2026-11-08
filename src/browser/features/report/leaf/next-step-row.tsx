// レポートの末尾の次の一手の行。押すと入力欄に下書きを入れるだけで、送らない。

import { type ReactElement, use, useState } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../../shared/session/session-digest.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { buildNextSteps, type NextStep } from "../domain/next-step-plan.ts"
import { ReplyPortContext } from "../reply-port.ts"
import styles from "./leaf.module.css"

/** 次の一手の行の元になるレポートの欄。 */
export type NextStepsOrigin = {
  readonly sessionRemaining: SessionRemaining
  readonly outcome?: ReportTaskOutcome
}

/** 口が無い・元の欄が1つも無いときは何も描かない。 */
export function NextStepRow(props: {
  readonly origin: NextStepsOrigin
  readonly components: readonly A2uiReportComponent[]
}): ReactElement {
  const slot = use(ReplyPortContext)
  const [choosing, setChoosing] = useState(false)
  const steps = buildNextSteps({ components: props.components, ...props.origin })
  if (slot.kind === "none" || steps.length === 0) {
    return <></>
  }
  const { port } = slot
  const alternative = steps.find((step) => step.kind === "alternative")
  return (
    <div className={styles["next-step"]}>
      <div role="group" aria-label="次の一手" className={styles["next-step-row"]}>
        <span className={styles["next-step-title"]} aria-hidden="true">
          次の一手
        </span>
        {steps.map((step, index) => (
          <Button
            key={step.kind}
            variant={index === 0 ? "outline-accent-tinted" : "outline"}
            size="label"
            pressed="none"
            disabled={false}
            disclosure={
              step.kind === "alternative"
                ? { kind: "expander", expanded: choosing }
                : { kind: "none" }
            }
            title={step.label}
            className={styles["next-step-button"]}
            onClick={() => pressed(step, port.appendDraft, () => setChoosing(!choosing))}
          >
            <span className={styles["next-step-label"]}>
              {step.label}
              {step.kind === "alternative" && <span aria-hidden="true">…</span>}
            </span>
          </Button>
        ))}
      </div>
      {choosing && alternative?.kind === "alternative" && (
        <div role="group" aria-label="別の案" className={styles["next-step-row"]}>
          {alternative.alternatives.map((option) => (
            <Button
              key={option.name}
              variant="outline"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              title={option.name}
              className={styles["next-step-button"]}
              onClick={() => {
                port.appendDraft(option.draft)
                setChoosing(false)
              }}
            >
              <span className={styles["next-step-label"]}>{option.name}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function pressed(step: NextStep, append: (text: string) => void, toggleChooser: () => void): void {
  if (step.kind === "alternative") {
    toggleChooser()
    return
  }
  append(step.draft)
}
