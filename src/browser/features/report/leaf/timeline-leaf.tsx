// `Timeline`（時刻の軸に載せた帯・出来事）を Markdown に戻さず直接描く。位置は型のある % の数から style を作る。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { plainInline } from "../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import {
  type TimelineArrowLayout,
  type TimelineRowLayout,
  type TimelineTrackLayout,
  timelineLayoutOf,
} from "../../../../shared/report/timeline-markdown.ts"
import { figureClassName } from "../markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

const LEVEL_HEIGHT_EM = 1.3

export function TimelineLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Timeline") {
    return <></>
  }
  const layout = timelineLayoutOf({ ...part, kind: "timeline" })
  const deepestLevel = Math.max(0, ...layout.events.map((event) => event.level))
  return (
    <FoldedLeafFrame value={value} title={part.title} fit={false} fold={part.fold} swap={false}>
      <div className={figureClassName("timeline")}>
        <div className={figureClassName("timeline-axis")}>
          {layout.axis.map((tick, index) => (
            <span
              key={`${String(index)}:${tick.label}`}
              className={figureClassName("timeline-tick")}
              style={{ width: percent(tick.width) }}
            >
              {plainInline(tick.label)}
            </span>
          ))}
        </div>
        <div
          className={figureClassName("timeline-body")}
          style={
            deepestLevel > 0
              ? {
                  paddingBlockStart: `calc(var(--space-lg) + ${String(deepestLevel * LEVEL_HEIGHT_EM)}em)`,
                }
              : undefined
          }
        >
          {layout.lanes.map(({ lane, rows }) => (
            <LaneView key={lane} lane={lane} rows={rows} />
          ))}
          {layout.events.length > 0 && (
            <div className={figureClassName("timeline-events")}>
              {layout.events.map((event, index) => (
                <span
                  key={`${String(index)}:${event.label}`}
                  className={figureClassName("timeline-event")}
                  title={plainInline(event.title)}
                  style={{
                    marginLeft: percent(event.marginLeft),
                    insetBlockStart: `${String(event.level * LEVEL_HEIGHT_EM)}em`,
                  }}
                >
                  <span className={figureClassName("timeline-event-label")}>
                    {plainInline(event.label)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {layout.legend.length > 0 && (
        <div className={figureClassName("timeline-legend")}>
          {layout.legend.map(({ swatch, label }) => (
            <span key={swatch} className={figureClassName("timeline-legend-item")}>
              <span
                className={clsx(
                  figureClassName("timeline-legend-swatch"),
                  figureClassName(`timeline-legend-swatch-${swatch}`),
                )}
                aria-hidden="true"
              />
              {label}
            </span>
          ))}
        </div>
      )}
    </FoldedLeafFrame>
  )
}

function LaneView(props: {
  readonly lane: string
  readonly rows: readonly TimelineRowLayout[]
}): ReactElement {
  return (
    <>
      {props.lane !== "" && (
        <div className={figureClassName("timeline-lane")}>{plainInline(props.lane)}</div>
      )}
      {props.rows.map((row, index) => (
        <div key={`${String(index)}:${row.name}`} className={figureClassName("timeline-row")}>
          <span className={figureClassName("timeline-name")} title={plainInline(row.name)}>
            {plainInline(row.name)}
          </span>
          <span className={figureClassName("timeline-track")}>
            <TrackView track={row.track} />
            {row.arrows.map((arrow) => (
              <ArrowView key={String(arrow.rowSpan)} arrow={arrow} />
            ))}
          </span>
          {row.track.kind === "bar" &&
            row.track.uncertain.kind === "shown" &&
            row.track.uncertain.label !== "" && (
              <span
                className={figureClassName("timeline-uncertain-label")}
                style={{ marginInlineStart: alongAxis(uncertainLeftOf(row.track)) }}
              >
                {plainInline(row.track.uncertain.label)}
              </span>
            )}
        </div>
      ))}
    </>
  )
}

/** 矢じりの幅（px）。線は矢じりの後ろで止める。 */
const ARROW_HEAD_PX = 8

/**
 * 待たれる行の終わりから、この行の帯の開始へ入る矢印。帯の段の縦の中心どうしを結ぶ。
 * 線は 0〜100 の箱に引いて伸ばし、矢じりは伸ばさない別の svg に描く。
 */
function ArrowView(props: { readonly arrow: TimelineArrowLayout }): ReactElement {
  const { from, to, rowSpan, laneSpan, labelSpan } = props.arrow
  const forward = from < to
  const rise = `(${String(rowSpan)} * var(--timeline-row-height) + ${String(laneSpan)} * var(--timeline-lane-height) + ${String(labelSpan)} * var(--timeline-label-height))`
  const [sourceX, targetX] = forward ? [0, 100] : [100, 0]
  const [sourceY, targetY] = rowSpan > 0 ? [0, 100] : [100, 0]
  const curve = forward
    ? `C50,${String(sourceY)} 50,${String(targetY)}`
    : `C${String(sourceX)},50 ${String(targetX)},50`
  const halfHead = ARROW_HEAD_PX / 2
  return (
    <>
      <svg
        className={figureClassName("timeline-arrow")}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          insetInlineStart: forward
            ? alongAxis(from)
            : `calc(${alongAxis(to)} - ${String(halfHead)}px)`,
          inlineSize: forward
            ? `max(0px, calc(${alongAxis(to - from)} - ${String(ARROW_HEAD_PX)}px))`
            : `calc(${alongAxis(from - to)} + ${String(halfHead)}px)`,
          insetBlockStart: `calc(50% - max(0px, ${rise}))`,
          blockSize: `max(${rise}, -1 * ${rise})`,
        }}
      >
        <path
          d={`M${String(sourceX)},${String(sourceY)} ${curve} ${String(targetX)},${String(targetY)}`}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        className={figureClassName("timeline-arrow-head")}
        viewBox={`0 0 ${String(ARROW_HEAD_PX)} ${String(ARROW_HEAD_PX)}`}
        aria-hidden="true"
        style={{
          insetInlineStart: `calc(${alongAxis(to)} - ${String(ARROW_HEAD_PX)}px)`,
          insetBlockStart: `calc(50% - ${String(halfHead)}px)`,
        }}
      >
        <path
          d={`M0,0 L${String(ARROW_HEAD_PX)},${String(halfHead)} L0,${String(ARROW_HEAD_PX)} Z`}
        />
      </svg>
    </>
  )
}

/** 止まりうる区間の左端（軸の %）。 */
function uncertainLeftOf(track: Extract<TimelineTrackLayout, { readonly kind: "bar" }>): number {
  return track.extras.reduce((sum, width) => sum + width, track.marginLeft + track.width)
}

/** 軸の % を、行の右の余白を除いた幅に対する長さにする。 */
function alongAxis(value: number): string {
  return `calc((100% - var(--timeline-end-gutter)) * ${String(value)} / 100)`
}

function TrackView(props: { readonly track: TimelineTrackLayout }): ReactElement {
  const { track } = props
  const emphasis = track.emphasized ? figureClassName("timeline-bar-emphasis") : undefined
  if (track.kind === "point") {
    return (
      <span
        className={clsx(figureClassName("timeline-point"), emphasis)}
        title={plainInline(track.title)}
        style={{ marginLeft: percent(track.marginLeft) }}
      />
    )
  }
  return (
    <>
      <span
        className={clsx(figureClassName("timeline-bar"), emphasis)}
        title={plainInline(track.title)}
        style={{ marginLeft: percent(track.marginLeft), width: percent(track.width) }}
      />
      {track.extras.map((width, index) => (
        <span
          key={`${String(index)}:${String(width)}`}
          className={figureClassName("timeline-extra")}
          style={{ width: percent(width) }}
        />
      ))}
      {track.uncertain.kind === "shown" && (
        <span
          className={figureClassName("timeline-uncertain")}
          style={{ width: percent(track.uncertain.width) }}
        />
      )}
    </>
  )
}

function percent(value: number): string {
  return `${String(value)}%`
}
