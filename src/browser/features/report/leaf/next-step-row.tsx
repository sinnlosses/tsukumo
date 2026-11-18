// レポートの末尾の次の一手の行。押すと入力欄に下書きを入れるだけで、送らない。

import { type ReactElement, use, useState } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportChecksView } from "../../../../shared/report/report-check-view.ts"
import type { ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../../shared/session/session-digest.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { buildNextSteps, type NextStep, unobservedOf } from "../domain/next-step-plan.ts"
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
  readonly checks: ReportChecksView
}): ReactElement {
  const slot = use(ReplyPortContext)
  const [choosing, setChoosing] = useState(false)
  const steps = buildNextSteps({
    components: props.components,
    unobserved: unobservedOf(props.checks),
    ...props.origin,
  })
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
        <span className={styles["next-step-note"]}>押すと、入力欄に下書きが入る（送らない）</span>
        {steps.map((step, index) =>
          step.kind === "check-result" ? (
            <span
              key={`${step.kind}:${step.label}`}
              role="group"
              aria-label={step.label}
              className={styles["next-step-check"]}
            >
              <span className={styles["next-step-label"]}>{step.label}</span>
              {[
                { name: "確かめた", draft: step.confirmedDraft },
                { name: "違った", draft: step.mismatchDraft },
              ].map(({ name, draft }) => (
                <Button
                  key={name}
                  variant="outline"
                  size="label"
                  pressed="none"
                  disabled={false}
                  disclosure={{ kind: "none" }}
                  className={styles["next-step-button"]}
                  onClick={() => port.appendDraft(draft)}
                >
                  <NextStepLabel kindLabel={name} label={draft} note="" />
                </Button>
              ))}
            </span>
          ) : (
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
              className={styles["next-step-button"]}
              onClick={() => pressed(step, port.appendDraft, () => setChoosing(!choosing))}
            >
              {step.kind === "alternative" ? (
                <span className={styles["next-step-label"]}>
                  {step.kindLabel}
                  <span aria-hidden="true">…</span>
                </span>
              ) : (
                <NextStepLabel kindLabel={step.kindLabel} label={step.label} note={step.note} />
              )}
            </Button>
          ),
        )}
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
              className={styles["next-step-button"]}
              onClick={() => {
                port.appendDraft(option.draft)
                setChoosing(false)
              }}
            >
              <NextStepLabel kindLabel={option.name} label={option.draft} note="" />
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 種類の語・主の字（押すと入る文の1行目）・添え書きを、切らずに折り返して出す。 */
function NextStepLabel(props: {
  readonly kindLabel: string
  readonly label: string
  readonly note: string
}): ReactElement {
  return (
    <span className={styles["next-step-label"]}>
      <span className={styles["next-step-kind"]}>{props.kindLabel}</span> <span>{props.label}</span>
      {props.note !== "" && <span className={styles["next-step-extra"]}>{props.note}</span>}
    </span>
  )
}

function pressed(step: NextStep, append: (text: string) => void, toggleChooser: () => void): void {
  if (step.kind === "alternative") {
    toggleChooser()
    return
  }
  if (step.kind !== "check-result") {
    append(step.draft)
  }
}
