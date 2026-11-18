// 進み具合のプログレスバーの器。状態の印・見出し・一文・段の丸の並び・経過・手順の口の1行と、押すと開く依頼の手順の一覧。
//
// `aria-live` は付けない。

import clsx from "clsx"
import type { ReactElement } from "react"

import { CurrentWorkBackground } from "../../../../../features/current-work/current-work-background.tsx"
import { CurrentWorkStepGroup } from "../../../../../features/current-work/current-work-step-group.tsx"
import {
  detailBlockClassName,
  phaseTimesClassName,
} from "../../../../../features/report/markdown.tsx"
import { PhaseTimeSummary } from "../../../../../features/report/report.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Disclosure, DisclosureMark } from "../../../../ui/disclosure/disclosure.tsx"
import { CheckIcon, CloseIcon } from "../../../../ui/icon/icon.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { WorkStripResult } from "../../domain/turn-result-mark.ts"
import type { StepsLanding } from "../../stores/work-strip-step-list.ts"
import { nowStepKeyOf, targetPartsOf, type Doing } from "./domain/now-step-statement.ts"
import type { StepsPhaseRow } from "./domain/steps-phase-row.ts"
import type { WorkStripMark } from "./domain/work-strip-status.ts"
import { useStepsLanding } from "./hooks/use-steps-landing.ts"
import type { WorkStripNow } from "./hooks/use-work-strip-now.ts"
import type {
  WorkStripModel,
  WorkStripPhase,
  WorkStripSpanHead,
  WorkStripSteps,
  WorkStripTrackSlot,
} from "./hooks/use-work-strip.ts"
import styles from "./main-view.module.css"

export function PresentationalWorkStrip(props: {
  readonly strip: WorkStripModel
  readonly now: WorkStripNow
}): ReactElement | undefined {
  const { strip, now } = props

  if (strip.kind === "none") {
    return undefined
  }

  return (
    <section aria-label="進み具合" className={styles["work-strip"]} data-work-strip={strip.kind}>
      <div className={styles["work-strip-line"]}>
        <StateMark result={strip.result} mark={strip.mark} />
        <Text
          element="span"
          size="body"
          tone={strip.result === "awaiting-answer" ? "state-warn" : "ink"}
          weight="bold"
          className={styles["work-strip-head"]}
        >
          {strip.headLabel}
        </Text>
        {(strip.statement !== "" || now.kind === "shown") && (
          <span aria-hidden="true" className={styles["work-strip-rule"]} />
        )}
        {now.kind === "shown" ? (
          <NowStatement now={now} />
        ) : (
          <Text
            element="span"
            size="secondary"
            tone="ink-quiet"
            weight="inherit"
            className={styles["work-strip-statement"]}
          >
            {strip.statement}
          </Text>
        )}
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
        {strip.phases.length > 0 && <PhaseTrack phases={strip.phases} />}
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
      {strip.steps.list.kind === "open" && (
        <StepsList
          phaseRows={strip.steps.phaseRows}
          phaseTimes={strip.steps.phaseTimes}
          backgroundList={strip.steps.backgroundList}
          landing={strip.steps.list.landing}
        />
      )}
    </section>
  )
}

/**
 * いまの手順の一文。手順が替わるあいだは、抜ける文と入る文を同じ1マスに重ね、上へ抜けて下から入れる。
 * 抜ける文の動きが終わったら `onLeft` で消す。
 */
function NowStatement(props: {
  readonly now: Extract<WorkStripNow, { readonly kind: "shown" }>
}): ReactElement {
  const { now } = props
  return (
    <span className={styles["work-strip-now"]} data-work-strip-now="">
      {now.leaving.kind === "statement" && (
        <NowSentence
          statement={now.leaving.statement}
          motion="leaving"
          onAnimationEnd={now.onLeft}
          key={`leaving:${nowStepKeyOf(now.leaving.statement)}`}
        />
      )}
      <NowSentence
        statement={now.statement}
        motion={now.leaving.kind === "statement" ? "entering" : "still"}
        key={now.key}
      />
    </span>
  )
}

function NowSentence(props: {
  readonly statement: Doing
  readonly motion: "still" | "entering" | "leaving"
  readonly onAnimationEnd?: () => void
}): ReactElement {
  const { statement, motion } = props
  const { head, tail } = targetPartsOf(statement.target, statement.mono)
  return (
    <span
      className={styles["work-strip-now-sentence"]}
      data-motion={motion}
      aria-hidden={motion === "leaving" ? "true" : undefined}
      title={statement.retryDetail === "" ? undefined : statement.retryDetail}
      onAnimationEnd={props.onAnimationEnd}
    >
      {statement.lead !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["work-strip-now-fixed"]}
        >
          {statement.lead}
        </Text>
      )}
      {statement.target !== "" && (
        <span
          className={clsx(
            styles["work-strip-now-target"],
            statement.mono && styles["is-mono"],
            tail !== "" && !head.endsWith("/") && styles["is-spaced"],
          )}
        >
          <Text
            element="span"
            size="label"
            tone="ink"
            weight="inherit"
            className={styles["work-strip-now-head"]}
          >
            {head}
          </Text>
          {tail !== "" && (
            <Text
              element="span"
              size="label"
              tone="ink"
              weight="inherit"
              className={styles["work-strip-now-fixed"]}
            >
              {tail}
            </Text>
          )}
        </span>
      )}
      {statement.particle !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["work-strip-now-fixed"]}
        >
          {statement.particle}
        </Text>
      )}
      <Text
        element="span"
        size="secondary"
        tone="ink"
        weight="semibold"
        className={styles["work-strip-now-fixed"]}
      >
        {statement.verb}
      </Text>
      {statement.elapsed !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["work-strip-now-elapsed"]}
        >
          {statement.elapsed}
        </Text>
      )}
      {statement.aside !== "" && (
        <Text
          element="span"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["work-strip-now-aside"]}
        >
          {statement.aside}
        </Text>
      )}
    </span>
  )
}

/**
 * 状態の印。見出しの左端が状態で動かないよう、印は点・四角・✕・チェックのどれも同じ 16px の箱に収める。
 * 状態は右の見出しが字で言うので、印は読み上げない。
 */
function StateMark(props: {
  readonly result: WorkStripResult
  readonly mark: WorkStripMark
}): ReactElement {
  return (
    <span
      className={styles["work-strip-mark-box"]}
      data-result={props.result}
      data-mark={props.mark}
      aria-hidden="true"
    >
      {props.mark === "dot" && <span className={styles["work-strip-dot"]} />}
      {props.mark === "square" && <span className={styles["work-strip-square"]} />}
      {props.mark === "cross" && <CloseIcon />}
      {props.mark === "check" && <CheckIcon />}
    </span>
  )
}

/**
 * 押すと開く依頼の手順の一覧。ワークプランの全フェーズを1行ずつ並べ、行の下にそのフェーズの手順を置く。
 * 失敗した手順・段を指して開いたときは、その行・区切りへ連れてくる。
 */
function StepsList(props: {
  readonly phaseRows: WorkStripSteps["phaseRows"]
  readonly phaseTimes: WorkStripSteps["phaseTimes"]
  readonly backgroundList: WorkStripSteps["backgroundList"]
  readonly landing: StepsLanding
}): ReactElement {
  const listRef = useStepsLanding(props.landing)
  const { rows, rest } = props.phaseRows
  return (
    <div ref={listRef} role="region" aria-label="依頼の手順" className={styles["work-strip-steps"]}>
      <CurrentWorkBackground list={props.backgroundList} runningMark="still" />
      {rows.length > 0 && (
        <ol className={styles["work-strip-plan"]}>
          {rows.map((row) => (
            <PhaseRow key={row.key} row={row} />
          ))}
        </ol>
      )}
      {rest.map((group) => (
        <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
      ))}
      {props.phaseTimes.kind === "times" && (
        <div className={clsx(detailBlockClassName, styles["work-strip-phase-times"])}>
          <div className={phaseTimesClassName("phase-times")}>
            <PhaseTimeSummary view={props.phaseTimes} />
          </div>
        </div>
      )}
    </div>
  )
}

/** フェーズの行。印・名前・所要と、その下の手順（済んだフェーズは畳み、今のフェーズは開く）。これからのフェーズは名前だけ。 */
function PhaseRow(props: { readonly row: StepsPhaseRow }): ReactElement {
  const { row } = props
  return (
    <li
      className={styles["work-strip-plan-row"]}
      data-phase-indexes={String(row.phaseIndex)}
      data-phase-state={row.state}
      data-phase-skipped={row.skipped ? "true" : undefined}
    >
      <p className={styles["work-strip-plan-head"]}>
        <span aria-hidden="true" className={styles["work-strip-plan-mark"]}>
          {row.mark}
        </span>
        {row.spanName !== "" && <span className={styles["work-strip-span"]}>{row.spanName}</span>}
        {row.parallelLabel !== "" && (
          <span className={styles["work-strip-span"]}>{row.parallelLabel}</span>
        )}
        <span className={styles["work-strip-plan-name"]}>
          {row.name}
          {row.skipped && "（飛ばした）"}
        </span>
        {row.duration !== "" && (
          <span className={styles["work-strip-plan-time"]}>{row.duration}</span>
        )}
      </p>
      {row.stepCount > 0 && (
        <Disclosure
          open={row.open}
          gap="none"
          hiddenOnNarrow={false}
          summaryTone="inherit"
          summarySize="inherit"
          className={styles["work-strip-plan-steps"]}
          summaryClassName=""
          summary={`手順 ${String(row.stepCount)}`}
        >
          {row.groups.map((group) => (
            <CurrentWorkStepGroup key={group.key} group={group} runningMark="still" />
          ))}
        </Disclosure>
      )}
    </li>
  )
}

/**
 * 段の丸を1本の線でつないだ並び。名前は `title` と読み上げで持ち、見えている名前は今の段の字だけ。
 * 並列のフェーズは中の段の丸を1つの囲みに並べ、囲みの中の丸どうしは線でつながない。
 * 群（前・本・後）の先頭の丸の前には群の名を置き、前の群の丸とは線でつながず間を空ける。
 */
function PhaseTrack(props: { readonly phases: readonly WorkStripTrackSlot[] }): ReactElement {
  return (
    <ol className={styles["work-strip-track"]}>
      {props.phases.map((slot) =>
        slot.kind === "collapsed" ? (
          <li
            key={slot.key}
            className={clsx(styles["work-strip-slot"], styles["work-strip-collapsed"])}
            data-phase-state="done"
            aria-label={slot.label}
            title={slot.label}
          >
            <span aria-hidden="true">{`✓${String(slot.count)}`}</span>
          </li>
        ) : slot.kind === "phase" ? (
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
function SpanName(props: { readonly spanHead: WorkStripSpanHead }): ReactElement | undefined {
  const { spanHead } = props
  if (spanHead.kind === "none") {
    return undefined
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
  return (
    <li
      className={props.className}
      data-phase-state={phase.state}
      data-phase-skipped={phase.skipped ? "true" : undefined}
      data-span-head={props.spanHead.kind === "head" ? "true" : undefined}
    >
      <SpanName spanHead={props.spanHead} />
      <button
        type="button"
        className={styles["work-strip-phase-dot"]}
        aria-label={phase.label}
        title={phase.label}
        onClick={phase.onToggle}
      >
        <span aria-hidden="true">{phase.mark}</span>
      </button>
    </li>
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
      <DisclosureMark open={props.steps.list.kind === "open"} />
      {props.steps.toggleLabel}
    </Button>
  )
}
