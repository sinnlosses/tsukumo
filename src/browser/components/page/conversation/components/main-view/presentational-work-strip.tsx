// 進み具合のプログレスバーの器。状態の印・見出し・一文・位置・経過・手順の口の1行と、その下端に沿う区間の下線と、押すと開く依頼の手順の一覧。
//
// `aria-live` は付けない。

import clsx from "clsx"
import type { ReactElement, RefObject } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { CheckIcon, ChevronRightIcon, CloseIcon } from "../../../../ui/icon/icon.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import type { WorkStripResult } from "../../domain/turn-result-mark.ts"
import { nowStepKeyOf, targetPartsOf, type Doing } from "./domain/now-step-statement.ts"
import type { WorkStripMark } from "./domain/work-strip-status.ts"
import type { WorkStripNow } from "./hooks/use-work-strip-now.ts"
import type { WorkStripPhaseDetail } from "./hooks/use-work-strip-phase-detail.ts"
import type { WorkStripSegmentsModel } from "./hooks/use-work-strip-segment-list.ts"
import type { WorkStripSteps } from "./hooks/use-work-strip-step-list.ts"
import type { WorkStripStepsPop } from "./hooks/use-work-strip-steps-pop.ts"
import type { WorkStripModel } from "./hooks/use-work-strip.ts"
import styles from "./main-view.module.css"
import { PresentationalPhaseDetail } from "./presentational-phase-detail.tsx"
import { PresentationalStepsList } from "./presentational-steps-list.tsx"

/** 「手順」の口が開く全体の詳細の id。 */
const STEPS_ID = "work-strip-steps"

export function PresentationalWorkStrip(props: {
  readonly strip: WorkStripModel
  readonly now: WorkStripNow
  readonly track: WorkStripSegmentsModel
  readonly phaseDetail: WorkStripPhaseDetail
  readonly stepsPop: WorkStripStepsPop
}): ReactElement | undefined {
  const { strip, now, track, phaseDetail } = props
  const { rootRef, toggleRef } = props.stepsPop

  if (strip.kind === "none") {
    return undefined
  }

  return (
    <section
      aria-label="進み具合"
      className={styles["work-strip"]}
      data-work-strip={strip.kind}
      data-result={strip.result}
    >
      <div className={styles["work-strip-line"]}>
        <StateMark result={strip.result} mark={strip.mark} />
        <Text
          element="span"
          size="secondary"
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
        {track.kind === "shown" && track.position.kind === "shown" && (
          <span className={styles["work-strip-position"]}>{track.position.text}</span>
        )}
        {strip.estimate.kind === "shown" && (
          <Text
            element="span"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["work-strip-eta"]}
          >
            あと{strip.estimate.low}〜{strip.estimate.high}分
          </Text>
        )}
        <div ref={rootRef} className={styles["work-strip-steps-root"]}>
          <StepsToggle steps={strip.steps} toggleRef={toggleRef} />
          {strip.steps.list.kind === "open" && (
            <PresentationalStepsList
              id={STEPS_ID}
              steps={strip.steps}
              landing={strip.steps.list.landing}
            />
          )}
          {track.kind === "shown" && <SegmentTrack track={track} phaseDetail={phaseDetail} />}
        </div>
      </div>
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
      {statement.verb !== "" && (
        <Text
          element="span"
          size="secondary"
          tone="ink"
          weight="semibold"
          className={styles["work-strip-now-fixed"]}
        >
          {statement.verb}
        </Text>
      )}
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
 * 帯の下端に沿う、フェーズを等分した区間の並び。区間はそれぞれボタンで、名前は読み上げと `title` で持つ。
 * 押すとその区間の下にフェーズの詳細が重なって出る。区間の並びと詳細は1つの要素で包み、外の押下はその外で数える。
 */
function SegmentTrack(props: {
  readonly track: Extract<WorkStripSegmentsModel, { readonly kind: "shown" }>
  readonly phaseDetail: WorkStripPhaseDetail
}): ReactElement {
  const { track, phaseDetail } = props
  const { popup, place, rootRef, onSegmentPress } = phaseDetail
  return (
    <div ref={rootRef} className={styles["work-strip-segment-root"]}>
      <ol className={styles["work-strip-segment-list"]}>
        {track.segments.map((segment) => (
          <li key={segment.key}>
            <button
              type="button"
              className={styles["work-strip-segment"]}
              aria-label={segment.label}
              title={segment.label}
              aria-expanded={popup.kind === "open" && popup.segmentKey === segment.key}
              data-segment-key={segment.key}
              data-segment-state={segment.state}
              data-unseen={segment.unseen ? "true" : undefined}
              data-landing={segment.landing ? "true" : undefined}
              onClick={(event) => {
                onSegmentPress(segment.key, event.currentTarget)
              }}
              onAnimationEnd={() => {
                track.onLanded(segment.key)
              }}
            >
              <span aria-hidden="true" className={styles["work-strip-segment-line"]} />
            </button>
          </li>
        ))}
      </ol>
      {popup.kind === "open" && (
        <PresentationalPhaseDetail detail={popup.detail} left={place.left} top={place.top} />
      )}
    </div>
  )
}

/** 「手順」の口。山形は閉じていれば下、開いていれば上を向く。 */
function StepsToggle(props: {
  readonly steps: WorkStripSteps
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}): ReactElement {
  const open = props.steps.list.kind === "open"
  return (
    <Button
      variant="outline"
      size="secondary"
      pressed="none"
      disabled={false}
      disclosure={{
        kind: "popover",
        popup: "none",
        ref: props.toggleRef,
        expanded: open,
        controls: STEPS_ID,
      }}
      className={styles["work-strip-toggle"]}
      onClick={props.steps.onToggle}
    >
      手順
      <span
        aria-hidden="true"
        className={styles["work-strip-toggle-mark"]}
        data-open={String(open)}
      >
        <ChevronRightIcon />
      </span>
    </Button>
  )
}
