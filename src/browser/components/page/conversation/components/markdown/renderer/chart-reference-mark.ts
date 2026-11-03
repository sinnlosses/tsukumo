// 折れ線の基準線（目標・上限の水平の点線と右端の名前）と、点の注記（輪の印と字）を描く。
// 中身は `options.plugins["tsukumo-chart-marks"]` から読む。

import { z } from "zod"

import type { ChartMarks } from "../../../domain/report-diagram-markdown.ts"
import { LABEL_OFFSET } from "./chart-label-layout.ts"
import { resolveColor } from "./theme-color.ts"

const MARKS_PLUGIN_ID = "tsukumo-chart-marks"
const REFERENCE_DASH = [6, 5]
const REFERENCE_WIDTH = 1.5
const RING_RADIUS = 6
const RING_WIDTH = 2
const NOTE_GAP = 10
const NOTE_LINE_HEIGHT = 16

const marksSchema = z.object({
  references: z.array(z.object({ value: z.number(), label: z.string() })),
  annotations: z.array(z.object({ series: z.number(), index: z.number(), text: z.string() })),
})

export type ReferenceLabel = { readonly y: number; readonly text: string }

export function chartMarksOf(chart: ChartInstance): ChartMarks {
  const parsed = marksSchema.safeParse(chart.options.plugins[MARKS_PLUGIN_ID])
  return parsed.success ? parsed.data : { references: [], annotations: [] }
}

/** 基準線の値が描く範囲に入るよう、値の軸（`y`）の範囲を広げる。 */
export function widenToReferences(
  chart: ChartInstance,
  scale: { readonly id: string; min: number; max: number },
): void {
  const values = chartMarksOf(chart).references.map(({ value }) => value)
  if (scale.id !== "y" || values.length === 0) {
    return
  }
  scale.min = Math.min(scale.min, ...values)
  scale.max = Math.max(scale.max, ...values)
}

/** 基準線の右端の名前と、その線の縦の位置。描く領域が決まってから呼ぶ。 */
export function referenceLabelsOf(chart: ChartInstance): ReferenceLabel[] {
  const scale = chart.scales["y"]
  if (scale === undefined) {
    return []
  }
  return chartMarksOf(chart).references.map(({ value, label }) => ({
    y: scale.getPixelForValue(value),
    text: label,
  }))
}

/** 基準線を点の無い点線で引き、名前を描く領域の右に `labelYs`（重なりを離した位置）で書く。 */
export function drawReferences(
  chart: ChartInstance,
  references: readonly ReferenceLabel[],
  labelYs: readonly number[],
): void {
  const { ctx, chartArea } = chart
  const color = resolveColor(chart.canvas, "--report-chart-reference")
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = REFERENCE_WIDTH
  ctx.setLineDash(REFERENCE_DASH)
  references.forEach(({ y, text }, index) => {
    ctx.beginPath()
    ctx.moveTo(chartArea.left, y)
    ctx.lineTo(chartArea.right, y)
    ctx.stroke()
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(text, chartArea.right + LABEL_OFFSET, labelYs[index] ?? y)
  })
  ctx.restore()
}

/**
 * 名指した点に輪の印を付け、注記の字を点の下に書く。
 * 字は、点が描く領域の右半分なら点の左へ、左半分なら右へ伸ばし、下に収まらなければ点の上に書く。
 */
export function drawAnnotations(chart: ChartInstance): void {
  const { ctx, chartArea } = chart
  const color = resolveColor(chart.canvas, "--state-ng")
  const middle = (chartArea.left + chartArea.right) / 2
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = RING_WIDTH
  chartMarksOf(chart).annotations.forEach(({ series, index, text }) => {
    const point = chart.getDatasetMeta(series).data[index]
    if (point === undefined || !chart.isDatasetVisible(series)) {
      return
    }
    ctx.beginPath()
    ctx.arc(point.x, point.y, RING_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    const toLeft = point.x > middle
    const below = point.y + NOTE_GAP + NOTE_LINE_HEIGHT <= chartArea.bottom
    ctx.textAlign = toLeft ? "right" : "left"
    ctx.textBaseline = below ? "top" : "bottom"
    ctx.fillText(
      text,
      point.x + (toLeft ? -NOTE_GAP : NOTE_GAP),
      point.y + (below ? NOTE_GAP : -NOTE_GAP),
    )
  })
  ctx.restore()
}
