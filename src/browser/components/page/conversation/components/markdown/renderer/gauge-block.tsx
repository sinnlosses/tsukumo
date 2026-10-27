// レポートの ```number-line / ```bullet フェンスの中身（`GaugeSpec` を JSON で書いたもの）を自前の SVG で描く。
// 位置は SVG 属性の百分率で置き、字は画面の画素のまま幅に追従する。色は `--accent` の濃淡だけ。

import type { ReactElement } from "react"
import { z } from "zod"

import type { GaugeSpec } from "../../../../../../../shared/report/plot-gauge.ts"
import styles from "./gauge-block.module.css"
import { gaugeLayoutOf } from "./gauge-layout.ts"

type GaugeBlockProps = {
  /** フェンスの中身（`GaugeSpec` の JSON）。 */
  readonly spec: string
}

const gaugeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("numberLine"),
    title: z.string(),
    unit: z.string(),
    values: z.array(z.number()).min(1),
  }),
  z.object({
    kind: z.literal("bullet"),
    title: z.string(),
    unit: z.string(),
    rows: z
      .array(
        z.object({
          label: z.string(),
          value: z.number(),
          target: z.number(),
          bands: z
            .array(z.object({ upTo: z.number() }))
            .min(1)
            .max(5),
        }),
      )
      .min(1),
  }),
]) satisfies z.ZodType<GaugeSpec>

const BAND_OPACITY_DARKEST = 0.3
const BAND_OPACITY_RANGE = 0.18

export function GaugeBlock(props: GaugeBlockProps): ReactElement {
  const spec = parseSpec(props.spec)
  if (spec === undefined) {
    return <pre>{props.spec}</pre>
  }
  const layout = gaugeLayoutOf(spec)

  if (layout.kind === "numberLine") {
    return (
      <svg
        className={styles["gauge"]}
        role="img"
        aria-label={layout.title}
        height={layout.height}
        data-gauge="number-line"
      >
        <line
          className={styles["gauge-axis"]}
          x1={percent(layout.minAt)}
          x2={percent(layout.maxAt)}
          y1={34}
          y2={34}
        />
        {layout.points.map((point) => (
          <g key={point.key}>
            <circle className={styles["gauge-point"]} cx={percent(point.at)} cy={34} r={5} />
            {point.labelled && (
              <text
                className={styles["gauge-text"]}
                x={percent(point.at)}
                y={18}
                textAnchor={point.anchor}
              >
                {point.text}
              </text>
            )}
          </g>
        ))}
        <text className={styles["gauge-quiet"]} x={percent(layout.minAt)} y={58}>
          {layout.unit}
        </text>
      </svg>
    )
  }

  return (
    <svg
      className={styles["gauge"]}
      role="img"
      aria-label={layout.title}
      height={layout.height}
      data-gauge="bullet"
    >
      {layout.rows.map((row) => (
        <g key={row.key}>
          <text className={styles["gauge-text"]} x={percent(layout.minAt)} y={row.top + 14}>
            {row.label}
          </text>
          <text
            className={styles["gauge-text"]}
            x={percent(layout.maxAt)}
            y={row.top + 14}
            textAnchor="end"
          >
            {row.valueText}
          </text>
          {row.bands.map((band) => (
            <rect
              key={band.key}
              className={styles["gauge-band"]}
              x={percent(band.from)}
              width={percent(Math.max(0, band.to - band.from))}
              y={row.top + 22}
              height={16}
              style={{ opacity: BAND_OPACITY_DARKEST - band.shade * BAND_OPACITY_RANGE }}
            />
          ))}
          <rect
            className={styles["gauge-value"]}
            x={percent(layout.minAt)}
            width={percent(Math.max(0, row.valueAt - layout.minAt))}
            y={row.top + 27}
            height={6}
          />
          <line
            className={styles["gauge-target"]}
            x1={percent(row.targetAt)}
            x2={percent(row.targetAt)}
            y1={row.top + 20}
            y2={row.top + 40}
          />
        </g>
      ))}
      <text className={styles["gauge-quiet"]} x={percent(layout.minAt)} y={layout.axisTextY}>
        {layout.minText}
      </text>
      <text
        className={styles["gauge-quiet"]}
        x={percent(layout.maxAt)}
        y={layout.axisTextY}
        textAnchor="end"
      >
        {layout.maxText}
      </text>
    </svg>
  )
}

function percent(at: number): string {
  return `${String(at * 100)}%`
}

function parseSpec(source: string): GaugeSpec | undefined {
  try {
    const parsed = gaugeSchema.safeParse(JSON.parse(source))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
