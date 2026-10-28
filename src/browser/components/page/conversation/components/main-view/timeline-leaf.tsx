// `Timeline`（時刻の軸に載せた帯・出来事）を Markdown に戻さず直接描く。位置は型のある % の数から style を作る。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import {
  type TimelineRowLayout,
  type TimelineTrackLayout,
  timelineLayoutOf,
} from "../../../../../../shared/report/timeline-markdown.ts"
import { figureClassName } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

export function TimelineLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Timeline") {
    return <></>
  }
  const layout = timelineLayoutOf({ ...part, kind: "timeline" })
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
        <div className={figureClassName("timeline-body")}>
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
                  style={{ marginLeft: percent(event.marginLeft) }}
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
          </span>
        </div>
      ))}
    </>
  )
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
    </>
  )
}

function percent(value: number): string {
  return `${String(value)}%`
}
