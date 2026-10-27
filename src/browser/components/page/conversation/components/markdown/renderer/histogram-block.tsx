// レポートの ```histogram フェンスの中身（`HistogramSpec` を JSON で書いたもの）を自前の SVG で描く。
// 横の位置は SVG 属性の百分率で置き、字は画面の画素のまま幅に追従する。色は `--accent` の濃淡だけ。

import type { ReactElement } from "react"
import { z } from "zod"

import type { HistogramSpec } from "../../../../../../../shared/report/plot-histogram.ts"
import { percent } from "./gauge-layout.ts"
import { histogramLayoutOf } from "./histogram-layout.ts"
import styles from "./plot-figure.module.css"

type HistogramBlockProps = {
  /** フェンスの中身（`HistogramSpec` の JSON）。 */
  readonly spec: string
}

const histogramSchema = z.object({
  kind: z.literal("histogram"),
  title: z.string(),
  unit: z.string(),
  bins: z.array(z.object({ from: z.number(), to: z.number(), count: z.number() })).min(1),
  median: z.number(),
  min: z.number(),
  max: z.number(),
}) satisfies z.ZodType<HistogramSpec>

export function HistogramBlock(props: HistogramBlockProps): ReactElement {
  const spec = parseSpec(props.spec)
  if (spec === undefined) {
    return <pre>{props.spec}</pre>
  }
  const layout = histogramLayoutOf(spec)
  return (
    <svg
      className={styles["plot"]}
      role="img"
      aria-label={layout.title}
      height={layout.height}
      data-plot="histogram"
    >
      <text
        className={styles["plot-text"]}
        x={percent(layout.medianAt)}
        y={12}
        textAnchor={layout.medianAnchor}
      >
        {layout.medianText}
      </text>
      <line
        className={styles["plot-median"]}
        x1={percent(layout.medianAt)}
        x2={percent(layout.medianAt)}
        y1={18}
        y2={layout.plotBottom}
      />
      {layout.bars.map((bar) => (
        <rect
          key={bar.key}
          className={styles["plot-bar"]}
          x={percent(bar.at)}
          width={percent(bar.width)}
          y={bar.top}
          height={bar.height}
        />
      ))}
      <line
        className={styles["plot-axis"]}
        x1={percent(layout.minAt)}
        x2={percent(layout.maxAt)}
        y1={layout.plotBottom}
        y2={layout.plotBottom}
      />
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
      <text className={styles["plot-quiet"]} x={percent(layout.minAt)} y={layout.noteY}>
        {layout.noteText}
      </text>
    </svg>
  )
}

function parseSpec(source: string): HistogramSpec | undefined {
  try {
    const parsed = histogramSchema.safeParse(JSON.parse(source))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
