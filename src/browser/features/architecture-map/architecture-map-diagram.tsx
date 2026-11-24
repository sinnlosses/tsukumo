// 地図の1枚の図を SVG で描く。箱は名前・下に summary を1行・子を持つ箱は潜れる印、
// エッジは実際のものを実線＋本数、意図したものを破線＋ラベルで描く。
// 選んだ箱の縁は狐火の青緑、ずれのある箱とずれたエッジは赤。

import clsx from "clsx"
import { type CSSProperties, type KeyboardEvent, type ReactElement, useId } from "react"

import type { MapView, MapViewBox, MapViewLane } from "../../../shared/architecture-map/map-view.ts"
import type { BoxChangeCount } from "../../../shared/report/report-map.ts"
import styles from "./architecture-map-diagram.module.css"
import {
  edgeEndsOf,
  type MapBoxRect,
  type MapBoxTitle,
  type MapDiagramForm,
  type MapGeometry,
  mapGeometryOf,
  type MapLaneRect,
} from "./architecture-map-geometry.ts"

type MiniTitle = { readonly fontSize: number; readonly limit: number }

/** 縮めた図の箱の名前の字の大きさ（図の座標の単位）と、切る字数。字数は `CELLS` のその形の箱の幅に収まる数。 */
const MINI_TITLES = {
  mini: { fontSize: 10, limit: 11 },
  report: { fontSize: 9, limit: 15 },
} as const satisfies Record<Exclude<MapDiagramForm, "full">, MiniTitle>

/** 縮めた格子の図は器の幅まで広げるが、この倍率で頭打ちにする（字が 14px を超えて矢印ごと大きくならないように）。 */
const MINI_MAX_SCALE = 1.4

/** 区画の組み方で縮めた図の、いちばん大きい名前の字の上限（px）。倍率の頭打ちをここから決める。 */
const LANE_MAX_FONT_PX = 14

/** 区画の色のトークン。`runtime` と `crosscut` は区画の定義の順にそれぞれの並びを巡る。 */
const RUNTIME_TONES = [
  "--chart-series-1",
  "--chart-series-3",
  "--chart-series-4",
  "--chart-series-5",
] as const
const CROSSCUT_TONES = ["--chart-series-6", "--chart-series-2"] as const
const EXTERNAL_TONE = "--ink-quiet"

export function ArchitectureMapDiagram(props: {
  readonly view: MapView
  readonly form: MapDiagramForm
  readonly selectedId?: string
  /** 会話のバッジに触れている箱。光らせる。 */
  readonly litId?: string
  /** 箱ごとの変えたファイルの件数（レポートのミニマップ）。渡すと、入っていない箱を薄くする。 */
  readonly changes?: ReadonlyMap<string, BoxChangeCount>
  /** 箱を押したとき。 */
  readonly onSelect: (box: MapViewBox) => void
}): ReactElement {
  const markerId = useId()
  const arrows = { normal: `${markerId}-arrow`, ng: `${markerId}-arrow-ng` }
  const geometry = mapGeometryOf(props.view, props.form)
  const lanes = geometry.lanes
  const tones = laneTonesOf(props.view.lanes ?? [])
  const miniTitle = props.form === "full" ? undefined : MINI_TITLES[props.form]
  const mini = miniTitle !== undefined
  const sizeProps = mini
    ? {
        width: "100%",
        style: {
          aspectRatio: `${geometry.width} / ${geometry.height}`,
          maxWidth: `${String(geometry.width * maxScaleOf(geometry))}px`,
        },
      }
    : { width: geometry.width, height: geometry.height }
  return (
    <svg
      className={clsx(styles["diagram"], mini && styles["diagram-mini"])}
      viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
      role="group"
      aria-label="地図の図"
      data-testid="architecture-map-diagram"
      {...sizeProps}
    >
      <defs>
        <ArrowHead id={arrows.normal} size={mini ? 5 : 7} className={styles["arrow-head"]} />
        <ArrowHead id={arrows.ng} size={mini ? 5 : 7} className={styles["arrow-head-ng"]} />
      </defs>
      {lanes !== undefined &&
        lanes.rects
          .filter((lane) => !lane.solo)
          .map((lane) => (
            <LaneFrame
              key={lane.lane.id}
              lane={lane}
              tone={tones.get(lane.lane.id) ?? EXTERNAL_TONE}
              heading={lanes.heading}
              mini={mini}
            />
          ))}
      {edgeShapesOf(props.view, geometry.rects, mini).map((shape) => (
        <EdgeLine key={shape.key} shape={shape} arrows={arrows} />
      ))}
      {props.view.boxes.map((box) => {
        const rect = geometry.rects.get(box.id)
        const laneTitle = lanes?.titles.get(box.id)
        const tone = box.lane === undefined ? undefined : tones.get(box.lane)
        return (
          rect !== undefined && (
            <BoxNode
              key={box.id}
              box={box}
              rect={rect}
              {...(miniTitle === undefined ? {} : { miniTitle })}
              {...(laneTitle === undefined ? {} : { laneTitle })}
              {...(laneTitle?.solo === true && tone !== undefined ? { tone } : {})}
              selected={box.id === props.selectedId}
              lit={box.id === props.litId}
              {...(props.changes === undefined
                ? {}
                : { change: props.changes.get(box.id) ?? { added: 0, other: 0 } })}
              onSelect={props.onSelect}
            />
          )
        )
      })}
    </svg>
  )
}

function maxScaleOf(geometry: MapGeometry): number {
  if (geometry.lanes === undefined) {
    return MINI_MAX_SCALE
  }
  const largest = Math.max(...[...geometry.lanes.titles.values()].map((title) => title.fontSize))
  return LANE_MAX_FONT_PX / largest
}

function laneTonesOf(lanes: readonly MapViewLane[]): ReadonlyMap<string, string> {
  const runtime = lanes.filter((lane) => lane.kind === "runtime")
  const crosscut = lanes.filter((lane) => lane.kind === "crosscut")
  return new Map(
    lanes.map((lane) => {
      if (lane.kind === "runtime") {
        return [lane.id, RUNTIME_TONES[runtime.indexOf(lane) % RUNTIME_TONES.length] ?? ""]
      }
      if (lane.kind === "crosscut") {
        return [lane.id, CROSSCUT_TONES[crosscut.indexOf(lane) % CROSSCUT_TONES.length] ?? ""]
      }
      return [lane.id, EXTERNAL_TONE]
    }),
  )
}

function toneStyle(tone: string): CSSProperties {
  return { "--lane": `var(${tone})` }
}

/** 箱が2つ以上ある区画と外部の区画の枠と見出し。 */
function LaneFrame(props: {
  readonly lane: MapLaneRect
  readonly tone: string
  readonly heading: { readonly height: number; readonly fontSize: number }
  readonly mini: boolean
}): ReactElement {
  const { lane, heading } = props
  return (
    <g
      data-lane={lane.lane.id}
      data-lane-kind={lane.lane.kind}
      className={styles["lane"]}
      style={toneStyle(props.tone)}
    >
      <rect
        x={lane.x}
        y={lane.y}
        width={lane.width}
        height={lane.height}
        rx={props.mini ? 6 : 10}
        className={styles["lane-frame"]}
      />
      <text
        x={lane.x + heading.fontSize * 0.7}
        y={lane.y + heading.height * 0.72}
        fontSize={heading.fontSize}
        className={styles["lane-heading"]}
      >
        {lane.lane.title}
      </text>
    </g>
  )
}

function ArrowHead(props: {
  readonly id: string
  readonly size: number
  readonly className?: string
}): ReactElement {
  return (
    <marker
      id={props.id}
      viewBox="0 0 8 8"
      refX="7"
      refY="4"
      markerWidth={props.size}
      markerHeight={props.size}
      orient="auto"
    >
      <path d="M0 0 L8 4 L0 8 z" className={props.className} />
    </marker>
  )
}

type EdgeKind = "actual" | "undeclared" | "intended"

type EdgeShape = {
  readonly key: string
  readonly kind: EdgeKind
  readonly label?: string
  readonly ends: ReturnType<typeof edgeEndsOf>
}

function edgeShapesOf(
  view: MapView,
  rects: ReadonlyMap<string, MapBoxRect>,
  mini: boolean,
): readonly EdgeShape[] {
  const endsOf = (from: string, to: string) => {
    const start = rects.get(from)
    const end = rects.get(to)
    return start === undefined || end === undefined ? [] : [edgeEndsOf(start, end)]
  }
  const actual = view.edges.flatMap((edge) =>
    endsOf(edge.from, edge.to).map((ends): EdgeShape => ({
      key: `a:${edge.from}>${edge.to}`,
      kind: edge.undeclared ? "undeclared" : "actual",
      ...(mini ? {} : { label: String(edge.count) }),
      ends,
    })),
  )
  const intended = view.intendedEdges.flatMap((edge) =>
    endsOf(edge.from, edge.to).map((ends): EdgeShape => ({
      key: `i:${edge.from}>${edge.to}:${edge.label ?? ""}:${edge.origin ?? ""}`,
      kind: "intended",
      ...(mini || edge.label === undefined ? {} : { label: edge.label }),
      ends,
    })),
  )
  return [...actual, ...intended]
}

function EdgeLine(props: {
  readonly shape: EdgeShape
  readonly arrows: { readonly normal: string; readonly ng: string }
}): ReactElement {
  const { ends, kind, label } = props.shape
  const bad = kind === "undeclared"
  return (
    <g data-edge={kind}>
      <line
        x1={ends.x1}
        y1={ends.y1}
        x2={ends.x2}
        y2={ends.y2}
        className={clsx(
          styles["edge"],
          kind === "intended" && styles["edge-intended"],
          bad && styles["edge-ng"],
        )}
        markerEnd={`url(#${bad ? props.arrows.ng : props.arrows.normal})`}
      />
      {label !== undefined && label !== "" && (
        <text
          x={(ends.x1 + ends.x2) / 2}
          y={(ends.y1 + ends.y2) / 2 - 4}
          textAnchor="middle"
          className={clsx(styles["edge-label"], bad && styles["edge-label-ng"])}
        >
          {label}
        </text>
      )}
    </g>
  )
}

function BoxNode(props: {
  readonly box: MapViewBox
  readonly rect: MapBoxRect
  /** 縮めた図の箱の名前。渡さなければ広げた図の箱で描く。 */
  readonly miniTitle?: MiniTitle
  /** 区画の組み方で描く箱の名前。渡すと、2行に折った名前をその座標に描く。 */
  readonly laneTitle?: MapBoxTitle
  /** 区画そのものが箱になった箱の区画の色のトークン。 */
  readonly tone?: string
  readonly selected: boolean
  readonly lit: boolean
  readonly change?: BoxChangeCount
  readonly onSelect: (box: MapViewBox) => void
}): ReactElement {
  const { box, rect, miniTitle, laneTitle, change } = props
  const mini = miniTitle !== undefined
  const titleY = laneTitle?.baselines[0] ?? rect.y + (mini ? rect.height / 2 + 3 : 25)
  const changeKind =
    change === undefined || change.added + change.other === 0
      ? undefined
      : change.other === 0
        ? "added"
        : "modified"
  const clipId = `${useId()}-clip`
  const select = () => {
    props.onSelect(box)
  }
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select()
    }
  }
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={box.title}
      aria-pressed={props.selected}
      data-box={box.id}
      data-selected={props.selected}
      data-lit={props.lit}
      data-problem={box.problems.length > 0}
      data-external={box.external}
      data-lane-box={laneTitle?.solo === true}
      {...(change === undefined ? {} : { "data-change": changeKind ?? "none" })}
      {...(props.tone === undefined ? {} : { style: toneStyle(props.tone) })}
      className={styles["box"]}
      onClick={select}
      onKeyDown={onKeyDown}
      // 地の部分のドラッグ（移動）へ押下を渡さない
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
    >
      <clipPath id={clipId}>
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width - (laneTitle === undefined ? 12 : 0)}
          height={rect.height}
        />
      </clipPath>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={laneTitle?.solo === true ? (mini ? 6 : 10) : mini ? 3 : 8}
        className={styles["box-body"]}
      />
      {laneTitle === undefined ? (
        <text
          x={rect.x + (mini ? 4 : 12)}
          y={titleY}
          className={styles["box-title"]}
          {...(mini ? { fontSize: miniTitle.fontSize, clipPath: `url(#${clipId})` } : {})}
        >
          {truncated(box.title, mini ? miniTitle.limit : 20)}
        </text>
      ) : (
        <text
          className={styles["box-title"]}
          fontSize={laneTitle.fontSize}
          clipPath={`url(#${clipId})`}
        >
          {laneTitle.lines.map((line, index) => (
            <tspan key={`${String(index)}:${line}`} x={laneTitle.x} y={laneTitle.baselines[index]}>
              {line}
            </tspan>
          ))}
        </text>
      )}
      {change !== undefined && changeKind !== undefined && (
        <text
          x={rect.x + rect.width - 4}
          y={titleY}
          textAnchor="end"
          className={styles["box-change"]}
          fontSize={laneTitle?.fontSize ?? miniTitle?.fontSize}
        >
          {changeKind === "added"
            ? `+${String(change.added)}`
            : String(change.added + change.other)}
        </text>
      )}
      {laneTitle === undefined && !mini && box.summary !== undefined && (
        <text
          x={rect.x + 12}
          y={rect.y + 46}
          clipPath={`url(#${clipId})`}
          className={styles["box-summary"]}
        >
          {truncated(box.summary, 14)}
        </text>
      )}
      {laneTitle?.summary !== undefined && (
        <text
          x={laneTitle.x}
          y={laneTitle.summary.baseline}
          fontSize={laneTitle.summary.fontSize}
          clipPath={`url(#${clipId})`}
          className={styles["box-summary"]}
        >
          {laneTitle.summary.text}
        </text>
      )}
      {!mini && box.hasChildren && (
        <text
          x={rect.x + rect.width - 14}
          y={titleY}
          textAnchor="end"
          className={styles["box-dive"]}
        >
          ›
        </text>
      )}
    </g>
  )
}

function truncated(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}
