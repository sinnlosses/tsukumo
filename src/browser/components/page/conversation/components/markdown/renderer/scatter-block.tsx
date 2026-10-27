// レポートの ```scatter フェンスの中身（`ScatterSpec` を JSON で書いたもの）を自前の SVG で描く。
// 横の位置は SVG 属性の百分率で置き、字は画面の画素のまま幅に追従する。色は `--accent` の濃淡だけ。

import type { ReactElement } from "react"
import { z } from "zod"

import type { ScatterSpec } from "../../../../../../../shared/report/plot-scatter.ts"
import { percent } from "./gauge-layout.ts"
import styles from "./plot-figure.module.css"
import { scatterLayoutOf } from "./scatter-layout.ts"

type ScatterBlockProps = {
  /** フェンスの中身（`ScatterSpec` の JSON）。 */
  readonly spec: string
}

const scatterSchema = z.object({
  kind: z.literal("scatter"),
  title: z.string(),
  xName: z.string(),
  yName: z.string(),
  points: z
    .array(z.object({ x: z.number(), y: z.number(), label: z.string(), outlier: z.boolean() }))
    .min(1),
}) satisfies z.ZodType<ScatterSpec>

const DOT_RADIUS = 3.5
const OUTLIER_RADIUS = 5

export function ScatterBlock(props: ScatterBlockProps): ReactElement {
  const spec = parseSpec(props.spec)
  if (spec === undefined) {
    return <pre>{props.spec}</pre>
  }
  const layout = scatterLayoutOf(spec)
  return (
    <svg
      className={styles["plot"]}
      role="img"
      aria-label={layout.title}
      height={layout.height}
      data-plot="scatter"
    >
      <text className={styles["plot-quiet"]} x={percent(layout.minAt)} y={12}>
        {layout.yText}
      </text>
      {layout.omitted > 0 && (
        <text className={styles["plot-quiet"]} x={percent(layout.maxAt)} y={30} textAnchor="end">
          {`ほか ${String(layout.omitted)} 点`}
        </text>
      )}
      <line
        className={styles["plot-axis"]}
        x1={percent(layout.minAt)}
        x2={percent(layout.maxAt)}
        y1={layout.plotBottom}
        y2={layout.plotBottom}
      />
      {layout.dots.map((dot) => (
        <circle
          key={dot.key}
          className={styles["plot-dot"]}
          cx={percent(dot.at)}
          cy={dot.y}
          r={DOT_RADIUS}
        />
      ))}
      {layout.outliers.map((outlier) => (
        <g key={outlier.key}>
          <circle
            className={styles["plot-outlier"]}
            cx={percent(outlier.at)}
            cy={outlier.y}
            r={OUTLIER_RADIUS}
          />
          {outlier.text !== "" && (
            <text
              className={styles["plot-text"]}
              x={percent(outlier.at)}
              y={outlier.textY}
              textAnchor={outlier.anchor}
            >
              {outlier.text}
            </text>
          )}
        </g>
      ))}
      <text className={styles["plot-quiet"]} x={percent(layout.minAt)} y={layout.axisTextY}>
        {layout.minText}
      </text>
      <text
        className={styles["plot-quiet"]}
        x={percent(layout.maxAt)}
        y={layout.axisTextY}
        textAnchor="end"
      >
        {layout.maxText}
      </text>
    </svg>
  )
}

function parseSpec(source: string): ScatterSpec | undefined {
  try {
    const parsed = scatterSchema.safeParse(JSON.parse(source))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
