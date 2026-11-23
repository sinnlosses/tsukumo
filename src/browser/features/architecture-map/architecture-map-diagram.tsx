// 地図の1枚の図を SVG で描く。箱は名前・下に summary を1行・子を持つ箱は潜れる印、
// エッジは実際のものを実線＋本数、意図したものを破線＋ラベルで描く。
// 選んだ箱の縁は狐火の青緑、ずれのある箱とずれたエッジは赤。

import clsx from "clsx"
import { type KeyboardEvent, type ReactElement, useId } from "react"

import type { MapView, MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import type { BoxChangeCount } from "../../../shared/report/report-map.ts"
import styles from "./architecture-map-diagram.module.css"
import {
  edgeEndsOf,
  type MapBoxRect,
  type MapDiagramForm,
  mapGeometryOf,
} from "./architecture-map-geometry.ts"

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
  const mini = props.form === "mini"
  const sizeProps = mini
    ? { width: "100%", style: { aspectRatio: `${geometry.width} / ${geometry.height}` } }
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
        <ArrowHead id={arrows.normal} className={styles["arrow-head"]} />
        <ArrowHead id={arrows.ng} className={styles["arrow-head-ng"]} />
      </defs>
      {edgeShapesOf(props.view, geometry.rects, mini).map((shape) => (
        <EdgeLine key={shape.key} shape={shape} arrows={arrows} />
      ))}
      {props.view.boxes.map((box) => {
        const rect = geometry.rects.get(box.id)
        return (
          rect !== undefined && (
            <BoxNode
              key={box.id}
              box={box}
              rect={rect}
              mini={mini}
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

function ArrowHead(props: { readonly id: string; readonly className?: string }): ReactElement {
  return (
    <marker
      id={props.id}
      viewBox="0 0 8 8"
      refX="7"
      refY="4"
      markerWidth="7"
      markerHeight="7"
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
  readonly mini: boolean
  readonly selected: boolean
  readonly lit: boolean
  readonly change?: BoxChangeCount
  readonly onSelect: (box: MapViewBox) => void
}): ReactElement {
  const { box, rect, mini, change } = props
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
      {...(change === undefined ? {} : { "data-change": changeKind ?? "none" })}
      className={styles["box"]}
      onClick={select}
      onKeyDown={onKeyDown}
      // 地の部分のドラッグ（移動）へ押下を渡さない
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
    >
      <clipPath id={clipId}>
        <rect x={rect.x} y={rect.y} width={rect.width - 12} height={rect.height} />
      </clipPath>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={mini ? 3 : 8}
        className={styles["box-body"]}
      />
      <text
        x={rect.x + (mini ? 4 : 12)}
        y={rect.y + (mini ? rect.height / 2 + 3 : 25)}
        className={styles["box-title"]}
        {...(mini ? { fontSize: 10 } : {})}
      >
        {truncated(box.title, mini ? 11 : 20)}
      </text>
      {change !== undefined && changeKind !== undefined && (
        <text
          x={rect.x + rect.width - 4}
          y={rect.y + (mini ? rect.height / 2 + 3 : 25)}
          textAnchor="end"
          className={styles["box-change"]}
          {...(mini ? { fontSize: 10 } : {})}
        >
          {changeKind === "added"
            ? `+${String(change.added)}`
            : String(change.added + change.other)}
        </text>
      )}
      {!mini && box.summary !== undefined && (
        <text
          x={rect.x + 12}
          y={rect.y + 46}
          clipPath={`url(#${clipId})`}
          className={styles["box-summary"]}
        >
          {truncated(box.summary, 14)}
        </text>
      )}
      {!mini && box.hasChildren && (
        <text
          x={rect.x + rect.width - 14}
          y={rect.y + 25}
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
