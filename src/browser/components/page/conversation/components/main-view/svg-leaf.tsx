// `Svg`（座標で描く図）を Markdown に戻さず直接描く。図形は型のある値から要素を作り、属性の許可リストは通らない。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import {
  type SvgPrimitive,
  svgDrawingOf,
} from "../../../../../../shared/report/report-diagram-markdown.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { figureClassName, ZoomableSvgFigure } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type SvgFigure = Parameters<typeof svgDrawingOf>[0]

export function SvgLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Svg") {
    return <></>
  }
  return (
    <FoldedLeafFrame value={value} title={part.title} fit fold={part.fold} swap={false}>
      <SvgFigureView figure={part} />
    </FoldedLeafFrame>
  )
}

/** svg の図と、その凡例を描く。 */
export function SvgFigureView(props: { readonly figure: SvgFigure }): ReactElement {
  const drawing = svgDrawingOf(props.figure)
  return (
    <>
      <ZoomableSvgFigure className={figureClassName("svg-figure")}>
        <svg
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
          {drawing.primitives.map((primitive, index) => (
            <Primitive
              key={`${String(index)}:${primitive.kind}`}
              primitive={primitive}
              arrowMarkerId={drawing.arrowMarkerId}
            />
          ))}
        </svg>
      </ZoomableSvgFigure>
      {drawing.legend.length > 0 && (
        <div className={figureClassName("svg-legend")}>
          {drawing.legend.map((item) => (
            <span key={`${item.tone}:${item.label}`} className={figureClassName("svg-legend-item")}>
              <svg viewBox="0 0 16 12" width="16" height="12">
                <rect data-tone={item.tone} x="1" y="1" width="14" height="10" rx="2" />
              </svg>
              {plainInline(item.label)}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function Primitive(props: {
  readonly primitive: SvgPrimitive
  readonly arrowMarkerId: string
}): ReactElement {
  const { primitive } = props
  switch (primitive.kind) {
    case "rect":
      return (
        <rect
          x={primitive.x}
          y={primitive.y}
          width={primitive.width}
          height={primitive.height}
          rx="4"
          strokeWidth={primitive.emphasis ? "3" : undefined}
          data-tone={primitive.tone}
        />
      )
    case "line":
      return (
        <line
          x1={primitive.x1}
          y1={primitive.y1}
          x2={primitive.x2}
          y2={primitive.y2}
          markerEnd={primitive.arrow ? `url(#${props.arrowMarkerId})` : undefined}
          strokeDasharray={primitive.dashed ? "6 4" : undefined}
          data-tone={primitive.tone}
        />
      )
    case "text":
      return (
        <text
          x={primitive.x}
          y={primitive.y}
          fontSize={primitive.fontSize}
          textAnchor={primitive.centered ? "middle" : undefined}
          dominantBaseline={primitive.centered ? "middle" : undefined}
          data-sub={primitive.sub ? "" : undefined}
        >
          {plainInline(primitive.text)}
        </text>
      )
  }
}
