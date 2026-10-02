// 進み具合の帯の器。段の丸の並び・今の段・位置と経過・手順の口の1行目と、走っている手順の2行目、押すと開く依頼の手順の一覧。
//
// `aria-live` は付けない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { CurrentWorkStepGroup } from "../../../../../../../features/current-work/components/current-work-step-group.tsx"
import { Button } from "../../../../../../ui/button/button.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import { useFailedStepFocus } from "./hooks/use-failed-step-focus.ts"
import type {
  WorkStripActivity,
  WorkStripModel,
  WorkStripPhase,
  WorkStripSteps,
} from "./hooks/use-work-strip.ts"
import styles from "./work-strip.module.css"

export function PresentationalWorkStrip(props: {
  readonly strip: WorkStripModel
}): ReactElement | null {
  const { strip } = props

  if (strip.kind === "none") {
    return null
  }

  return (
    <section aria-label="進み具合" className={styles["work-strip"]} data-work-strip={strip.kind}>
      <div className={styles["work-strip-line"]}>
        <PhaseTrack phases={strip.phases} />
        <Text
          element="span"
          size="body"
          tone="ink"
          weight={strip.kind === "working" ? "bold" : "normal"}
          className={styles["work-strip-head"]}
        >
          {strip.headLabel}
        </Text>
        <Text
          element="span"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["work-strip-side"]}
        >
          {strip.sideLabel}
        </Text>
        <StepsToggle steps={strip.steps} />
      </div>
      {strip.kind === "working" && <ActivityLine activity={strip.activity} />}
      {strip.steps.list.kind === "open" && (
        <StepsList groups={strip.steps.groups} failureSignal={strip.steps.list.failureSignal} />
      )}
    </section>
  )
}

/** 押すと開く依頼の手順の一覧。失敗した手順を指して開いたときは、最初の失敗の行へ連れてくる。 */
function StepsList(props: {
  readonly groups: WorkStripSteps["groups"]
  readonly failureSignal: number
}): ReactElement {
  const listRef = useFailedStepFocus(props.failureSignal)
  return (
    <div ref={listRef} role="region" aria-label="依頼の手順" className={styles["work-strip-steps"]}>
      {props.groups.map((group) => (
        <CurrentWorkStepGroup key={group.key} group={group} />
      ))}
    </div>
  )
}

/** 段の丸を1本の線でつないだ並び。名前は `title` と読み上げで持ち、見えている名前は今の段の字だけ。 */
function PhaseTrack(props: { readonly phases: readonly WorkStripPhase[] }): ReactElement {
  return (
    <ol className={styles["work-strip-track"]}>
      {props.phases.map((phase) => (
        <li
          key={phase.key}
          className={styles["work-strip-phase"]}
          data-phase-state={phase.state}
          aria-label={phase.label}
          title={phase.label}
        >
          <span aria-hidden="true">{phase.mark}</span>
        </li>
      ))}
    </ol>
  )
}

function StepsToggle(props: { readonly steps: WorkStripSteps }): ReactElement {
  return (
    <Button
      variant="outline"
      size="secondary"
      pressed="none"
      disabled={false}
      ariaLabel={undefined}
      disclosure={{ kind: "expander", expanded: props.steps.list.kind === "open" }}
      ariaHasPopup={undefined}
      title={undefined}
      className={styles["work-strip-toggle"]}
      onClick={props.steps.onToggle}
    >
      {props.steps.toggleLabel}
    </Button>
  )
}

function ActivityLine(props: { readonly activity: WorkStripActivity }): ReactElement {
  const { activity } = props
  return (
    <p className={clsx(styles["work-strip-activity"], activity.mono && styles["is-mono"])}>
      <Text
        element="span"
        size="secondary"
        tone={activity.tone === "asking" ? "state-warn" : "ink-quiet"}
        weight="inherit"
        className={styles["work-strip-activity-text"]}
      >
        {activity.text}
      </Text>
      {activity.retry.kind === "retrying" && (
        <Text
          element="span"
          size="secondary"
          tone="state-warn"
          weight="inherit"
          className={styles["work-strip-retry"]}
        >
          <span title={activity.retry.detail}>{activity.retry.label}</span>
        </Text>
      )}
    </p>
  )
}
