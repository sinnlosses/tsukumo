// `Graph`（名前とつながりの図）を Markdown に戻さず直接描く。

import clsx from "clsx"
import { Fragment, type ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { CardChainItem } from "../../../../../../shared/report/card-chain-markdown.ts"
import { graphDrawingOf } from "../../../../../../shared/report/graph-drawing.ts"
import {
  type FoldText,
  type GraphFoldDrawing,
  graphFoldDrawingOf,
} from "../../../../../../shared/report/graph-fold-html.ts"
import { graphLegendItemsOf } from "../../../../../../shared/report/report-graph-markdown.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { figureClassName, MermaidFigure, ZoomableSvgFigure } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type GraphPart = Extract<A2uiReportComponent, { readonly component: "Graph" }>

export function GraphLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Graph") {
    return <></>
  }
  const drawing = graphDrawingOf(part)
  return (
    <FoldedLeafFrame
      value={value}
      title={part.title}
      fit={drawing.kind === "fold"}
      fold={part.fold}
      swap={false}
    >
      {drawing.kind === "chain" && (
        <>
          <CardChainView chain={drawing.chain} />
          <GraphLegend part={part} withShapes={false} />
        </>
      )}
      {drawing.kind === "fold" && (
        <>
          <FoldView drawing={graphFoldDrawingOf(drawing.figure)} />
          <GraphLegend part={part} withShapes />
        </>
      )}
      {drawing.kind === "mermaid" && (
        <>
          <MermaidFigure source={drawing.source} />
          <GraphLegend part={part} withShapes />
        </>
      )}
    </FoldedLeafFrame>
  )
}

function CardChainView(props: { readonly chain: readonly CardChainItem[] }): ReactElement {
  return (
    <ol className={figureClassName("card-chain")} aria-label="連鎖">
      {props.chain.map((item, index) =>
        item.kind === "card" ? (
          <li key={`${String(index)}:card`} className={cardClassName(item)}>
            {item.tone !== "none" && (
              <span className={cardToneClassName(item.tone)} aria-hidden="true" />
            )}
            <span className={figureClassName("card-chain-name")}>{plainInline(item.name)}</span>
            {item.note !== "" && (
              <span className={figureClassName("card-chain-note")}>{plainInline(item.note)}</span>
            )}
          </li>
        ) : (
          <li key={`${String(index)}:arrow`} className={arrowClassName(item)} aria-hidden="true">
            {item.label !== "" && (
              <span className={figureClassName("card-chain-edge")}>{plainInline(item.label)}</span>
            )}
          </li>
        ),
      )}
    </ol>
  )
}

function cardClassName(item: Extract<CardChainItem, { readonly kind: "card" }>): string {
  return clsx(
    figureClassName("card-chain-card"),
    item.change !== "unchanged" && figureClassName(`card-chain-${item.change}`),
  )
}

function cardToneClassName(tone: Exclude<CardChainItem["tone"], "none">): string {
  return clsx(figureClassName("card-chain-tone"), figureClassName(`card-chain-tone-${tone}`))
}

function arrowClassName(item: Extract<CardChainItem, { readonly kind: "arrow" }>): string {
  return clsx(
    figureClassName("card-chain-arrow"),
    item.tone !== "none" && figureClassName(`card-chain-tone-${item.tone}`),
    item.change !== "unchanged" && figureClassName(`card-chain-${item.change}`),
  )
}

function FoldView(props: { readonly drawing: GraphFoldDrawing }): ReactElement {
  const { drawing } = props
  return (
    <ZoomableSvgFigure className={figureClassName("svg-figure")}>
      <svg
        data-graph=""
        viewBox={`0 0 ${String(drawing.width)} ${String(drawing.height)}`}
        width={drawing.width}
        height={drawing.height}
      >
        <defs>
          <marker
            id={drawing.arrowMarkerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" />
          </marker>
        </defs>
        {drawing.frames.map((frame, index) => (
          <FrameView key={`${String(index)}:frame`} frame={frame} />
        ))}
        {drawing.paths.map((path, index) => (
          <polyline
            key={`${String(index)}:path`}
            points={path.points}
            markerEnd={`url(#${drawing.arrowMarkerId})`}
            data-return={path.returns ? "" : undefined}
            data-tone={path.tone}
            data-change={path.change}
            strokeDasharray={path.dashed ? "6 4" : undefined}
          />
        ))}
        {drawing.boxes.map((box, index) => (
          <Fragment key={`${String(index)}:box`}>
            {box.body.kind === "polygon" ? (
              <polygon points={box.body.points} data-tone={box.tone} data-change={box.change} />
            ) : (
              <rect
                x={box.body.x}
                y={box.body.y}
                width={box.body.width}
                height={box.body.height}
                rx={box.body.rx}
                data-tone={box.tone}
                data-change={box.change}
              />
            )}
            {box.texts.map((text, at) => (
              <FoldTextView key={`${String(at)}:text`} text={text} />
            ))}
          </Fragment>
        ))}
        {drawing.paths.flatMap((path, index) =>
          path.labels.map((label, at) => (
            <FoldTextView key={`${String(index)}:${String(at)}:label`} text={label} />
          )),
        )}
      </svg>
    </ZoomableSvgFigure>
  )
}

function FrameView(props: { readonly frame: GraphFoldDrawing["frames"][number] }): ReactElement {
  const { frame } = props
  return (
    <>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx="8"
        data-frame=""
        data-tone={frame.look.kind === "tone" ? frame.look.tone : undefined}
        data-ground={frame.look.kind === "ground" ? String(frame.look.ground) : undefined}
      />
      {frame.title !== undefined && <FoldTextView text={frame.title} />}
    </>
  )
}

function FoldTextView(props: { readonly text: FoldText }): ReactElement {
  const { text } = props
  return (
    <text
      x={text.x}
      y={text.y}
      fontSize={text.fontSize}
      textAnchor={text.anchor}
      data-sub={text.sub ? "" : undefined}
    >
      {plainInline(text.text)}
    </text>
  )
}

function GraphLegend(props: {
  readonly part: GraphPart
  readonly withShapes: boolean
}): ReactElement {
  const items = graphLegendItemsOf(props.part, props.withShapes)
  return (
    <>
      {items.length > 0 && (
        <div className={figureClassName("graph-legend")}>
          {items.map((item) => (
            <span
              key={`${item.kind}:${item.label}`}
              className={figureClassName("graph-legend-item")}
            >
              <span className={legendMarkClassName(item)} aria-hidden="true" />
              {plainInline(item.label)}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function legendMarkClassName(item: ReturnType<typeof graphLegendItemsOf>[number]): string {
  switch (item.kind) {
    case "shape":
      return clsx(
        figureClassName("graph-legend-shape"),
        figureClassName(`graph-legend-shape-${item.shape}`),
      )
    case "change":
      return clsx(
        figureClassName("graph-legend-swatch"),
        figureClassName(`graph-legend-${item.change}`),
      )
    case "return":
      return clsx(figureClassName("graph-legend-swatch"), figureClassName("graph-legend-return"))
    case "tone":
      return clsx(
        figureClassName("graph-legend-swatch"),
        figureClassName(`graph-legend-tone-${item.tone}`),
      )
  }
}
