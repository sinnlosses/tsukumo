// 面の頭の段ごとの所要時間（見出しの行・帯か横棒・一覧）を、値から直接描く。
// 要素・属性・class・text ノードの割れ方は、同じ値を HTML の塊にした `phaseTimesMarkdown` を Markdown で描いたものと同じにする。

import clsx from "clsx"
import type { ReactElement } from "react"

import type {
  PhaseBandRegionView,
  PhaseListRowView,
  PhaseTimesView,
  PhaseWaterfallGroupItemView,
} from "../../../../../../shared/report/report-phase-time.ts"
import { phaseTimesClassName } from "../markdown/markdown.tsx"

type Times = Extract<PhaseTimesView, { readonly kind: "times" }>

export function PhaseTimes(props: { readonly view: Times }): ReactElement {
  const { totalText, chart, rows } = props.view
  return (
    <div className={phaseTimesClassName("phase-times")}>
      <div className={phaseTimesClassName("phase-times-head")}>
        <span className={phaseTimesClassName("phase-times-heading")}>段ごとの時間</span>
        <span className={phaseTimesClassName("phase-times-total")}>{totalText}</span>
      </div>
      {chart.kind === "band" && (
        <div className={phaseTimesClassName("phase-band")} aria-hidden="true">
          {chart.regions.map((region, index) => (
            <BandRegion key={`${String(index)}:${region.title}`} region={region} />
          ))}
        </div>
      )}
      {chart.kind === "waterfall" && (
        <div className={phaseTimesClassName("phase-waterfall")} aria-hidden="true">
          {chart.lines.map((line, index) =>
            line.kind === "group" ? (
              <div
                key={`${String(index)}:group`}
                className={phaseTimesClassName("phase-waterfall-group")}
              >
                {line.items.map((item, itemIndex) => (
                  <WaterfallItem key={`${String(itemIndex)}:${item.title}`} item={item} />
                ))}
              </div>
            ) : (
              <WaterfallItem key={`${String(index)}:${line.title}`} item={line} />
            ),
          )}
        </div>
      )}
      <div role="table" aria-label="段ごとの所要時間">
        {rows.map((entry, index) =>
          entry.kind === "row" ? (
            <ListRow key={`${String(index)}:${entry.row.valueText}`} row={entry.row} />
          ) : (
            <div
              key={`${String(index)}:group`}
              className={phaseTimesClassName("phase-time-group")}
              role="rowgroup"
            >
              <ListRow row={entry.head} />
              {entry.inner.map((row, innerIndex) => (
                <ListRow key={`${String(innerIndex)}:${row.valueText}`} row={row} />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function BandRegion(props: { readonly region: PhaseBandRegionView }): ReactElement {
  const { region } = props
  if (region.kind === "unknown") {
    return <span className={phaseTimesClassName("phase-band-unknown")} title={region.title} />
  }
  return (
    <span
      className={clsx(
        phaseTimesClassName("phase-band-segment"),
        region.longest && phaseTimesClassName("phase-band-longest"),
      )}
      title={region.title}
      style={{ flex: `${String(region.flexGrow)} 0 0` }}
    />
  )
}

function WaterfallItem(props: { readonly item: PhaseWaterfallGroupItemView }): ReactElement {
  const { item } = props
  const style = {
    marginLeft: `${String(item.marginLeftPercent)}%`,
    width: `${String(item.widthPercent)}%`,
  }
  if (item.kind === "wall") {
    return (
      <span
        className={clsx(
          phaseTimesClassName("phase-time-wall"),
          item.longest && phaseTimesClassName("phase-time-wall-longest"),
        )}
        title={item.title}
        style={style}
      />
    )
  }
  return (
    <div className={phaseTimesClassName("phase-waterfall-row")}>
      <span
        className={clsx(
          phaseTimesClassName("phase-waterfall-bar"),
          item.mark === "longest" && phaseTimesClassName("phase-waterfall-longest"),
          item.mark === "unknown" && phaseTimesClassName("phase-waterfall-unknown"),
        )}
        title={item.title}
        style={style}
      />
    </div>
  )
}

function ListRow(props: { readonly row: PhaseListRowView }): ReactElement {
  const { row } = props
  return (
    <div
      className={clsx(
        phaseTimesClassName("phase-time"),
        row.inner && phaseTimesClassName("phase-time-inner"),
        row.longest && phaseTimesClassName("phase-time-longest"),
        row.unknown && phaseTimesClassName("phase-time-unknown"),
      )}
      role="row"
    >
      {!row.inner && <span className={phaseTimesClassName("phase-time-mark")} />}
      <span className={phaseTimesClassName("phase-time-label")}>
        {row.label.kind === "numbered" && (
          <span className={phaseTimesClassName("phase-time-num")}>{row.label.num}</span>
        )}
        {row.label.kind === "numbered" ? row.label.name : row.label.text}
      </span>
      <span className={phaseTimesClassName("phase-time-value")}>{row.valueText}</span>
      <span className={phaseTimesClassName("phase-time-ratio")}>{row.ratioText}</span>
    </div>
  )
}
