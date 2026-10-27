// 進み具合の帯の器。状態のチップ・段の丸の並び・今の段・経過・手順の口の1行目と、走っている手順の2行目、押すと開く依頼の手順の一覧。
//
// `aria-live` は付けない。

import clsx from "clsx"
import type { ReactElement, RefObject } from "react"

import { CurrentWorkStepGroup } from "../../../../../features/current-work/components/current-work-step-group.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { WORK_STRIP_MARKS, type WorkStripResult } from "../../domain/turn-result-mark.ts"
import type { StepsLanding } from "../../stores/work-strip-step-list.ts"
import type { WorkActivity } from "./domain/work-activity.ts"
import { useStepsLanding } from "./hooks/use-steps-landing.ts"
import type {
  WorkStripModel,
  WorkStripPhase,
  WorkStripPhasePopover,
  WorkStripSlot,
  WorkStripSpanHead,
  WorkStripSteps,
} from "./hooks/use-work-strip.ts"
import styles from "./main-view.module.css"

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
        <StateChip result={strip.result} />
        {strip.readingLabel !== "" && (
          <Text
            element="span"
            size="secondary"
            tone="ink-quiet"
            weight="inherit"
            className={styles["work-strip-reading"]}
          >
            {strip.readingLabel}
          </Text>
        )}
        {strip.phases.length > 0 && <PhaseTrack phases={strip.phases} trackRef={strip.trackRef} />}
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
        <StepsList groups={strip.steps.groups} landing={strip.steps.list.landing} />
      )}
    </section>
  )
}

/** 状態のチップ。印は色の点。 */
function StateChip(props: { readonly result: WorkStripResult }): ReactElement {
  const { label } = WORK_STRIP_MARKS[props.result]
  return (
    <span className={styles["work-strip-chip"]} data-result={props.result}>
      <span className={styles["work-strip-dot"]} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

/** 押すと開く依頼の手順の一覧。失敗した手順・段を指して開いたときは、その行・区切りへ連れてくる。 */
function StepsList(props: {
  readonly groups: WorkStripSteps["groups"]
  readonly landing: StepsLanding
}): ReactElement {
  const listRef = useStepsLanding(props.landing)
  return (
    <div ref={listRef} role="region" aria-label="依頼の手順" className={styles["work-strip-steps"]}>
      {props.groups.map((group) => (
        <CurrentWorkStepGroup key={group.key} group={group} />
      ))}
    </div>
  )
}

/**
 * 段の丸を1本の線でつないだ並び。名前は `title` と読み上げで持ち、見えている名前は今の段の字だけ。
 * 並列の段は中の段の丸を1つの囲みに並べ、囲みの中の丸どうしは線でつながない。
 * 群（前・本・後）の先頭の丸の前には群の名を置き、前の群の丸とは線でつながず間を空ける。
 */
function PhaseTrack(props: {
  readonly phases: readonly WorkStripSlot[]
  readonly trackRef: RefObject<HTMLOListElement | null>
}): ReactElement {
  const { trackRef } = props
  return (
    <ol ref={trackRef} className={styles["work-strip-track"]}>
      {props.phases.map((slot) =>
        slot.kind === "phase" ? (
          <PhaseDot
            key={slot.phase.key}
            phase={slot.phase}
            spanHead={slot.spanHead}
            className={clsx(styles["work-strip-slot"], styles["work-strip-phase"])}
          />
        ) : (
          <li
            key={slot.key}
            className={styles["work-strip-slot"]}
            data-phase-state={slot.state}
            data-span-head={slot.spanHead.kind === "head" ? "true" : undefined}
            aria-label={slot.label}
          >
            <SpanName spanHead={slot.spanHead} />
            <ol className={styles["work-strip-group"]}>
              {slot.phases.map((phase) => (
                <PhaseDot
                  key={phase.key}
                  phase={phase}
                  spanHead={NO_SPAN_HEAD}
                  className={styles["work-strip-phase"]}
                />
              ))}
            </ol>
          </li>
        ),
      )}
    </ol>
  )
}

const NO_SPAN_HEAD = { kind: "none" } as const satisfies WorkStripSpanHead

/** 群の名。読み上げは丸の `aria-label`（「後1. 受け入れ」）が群を言うので隠す。 */
function SpanName(props: { readonly spanHead: WorkStripSpanHead }): ReactElement | null {
  const { spanHead } = props
  if (spanHead.kind === "none") {
    return null
  }
  return (
    <span
      aria-hidden="true"
      className={styles["work-strip-span"]}
      data-current={spanHead.current ? "true" : undefined}
    >
      {spanHead.name}
    </span>
  )
}

function PhaseDot(props: {
  readonly phase: WorkStripPhase
  readonly spanHead: WorkStripSpanHead
  readonly className: string
}): ReactElement {
  const { phase } = props
  const { popover } = phase
  return (
    <li
      className={props.className}
      data-phase-state={phase.state}
      data-phase-skipped={phase.skipped ? "true" : undefined}
      data-spinning={phase.spinning ? "true" : undefined}
      data-span-head={props.spanHead.kind === "head" ? "true" : undefined}
    >
      <SpanName spanHead={props.spanHead} />
      <button
        type="button"
        className={styles["work-strip-phase-dot"]}
        aria-label={phase.label}
        title={phase.label}
        aria-expanded={popover.kind === "open"}
        aria-controls={phase.popoverId}
        onClick={phase.onToggle}
      >
        <span aria-hidden="true">{phase.mark}</span>
      </button>
      {popover.kind === "open" && <PhasePopover id={phase.popoverId} popover={popover} />}
    </li>
  )
}

function PhasePopover(props: {
  readonly id: string
  readonly popover: Extract<WorkStripPhasePopover, { readonly kind: "open" }>
}): ReactElement {
  const { popover } = props
  const { placeRef } = popover
  return (
    <div
      ref={placeRef}
      id={props.id}
      role="dialog"
      aria-label={popover.title}
      className={styles["work-strip-pop"]}
    >
      <Text
        element="p"
        size="body"
        tone="ink"
        weight="bold"
        className={styles["work-strip-pop-title"]}
      >
        {popover.title}
      </Text>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["work-strip-pop-meta"]}
      >
        {popover.meta}
      </Text>
      {popover.summary !== "" && (
        <Text
          element="p"
          size="secondary"
          tone="inherit"
          weight="inherit"
          className={styles["work-strip-pop-summary"]}
        >
          {popover.summary}
        </Text>
      )}
      {popover.toSteps.kind === "shown" && (
        <button
          type="button"
          className={styles["work-strip-pop-go"]}
          onClick={popover.toSteps.onGo}
        >
          この段の手順へ
        </button>
      )}
    </div>
  )
}

function StepsToggle(props: { readonly steps: WorkStripSteps }): ReactElement {
  return (
    <Button
      variant="outline"
      size="secondary"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "expander", expanded: props.steps.list.kind === "open" }}
      className={styles["work-strip-toggle"]}
      onClick={props.steps.onToggle}
    >
      {props.steps.toggleLabel}
    </Button>
  )
}

function ActivityLine(props: { readonly activity: WorkActivity }): ReactElement {
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
