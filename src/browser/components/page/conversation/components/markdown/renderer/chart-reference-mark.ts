// 折れ線の基準線（目標・上限の水平の点線と右端の名前）と、点の注記（輪の印と字）を描く。
// 中身は `options.plugins["tsukumo-chart-marks"]` から読む。

import { z } from "zod"

import type { ChartMarks } from "../../../domain/report-diagram-markdown.ts"
import { directLabelOptionOf } from "./chart-direct-label-option.ts"
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

/** share に注記があるとき、描く領域の上に空けておく高さ（輪の半径＋字の1行）。 */
export function annotationHeadroom(chart: ChartInstance): number {
  return chartMarksOf(chart).annotations.length === 0
    ? 0
    : RING_RADIUS + NOTE_GAP + NOTE_LINE_HEIGHT
}

/** 名指した点・棒・部分に輪の印を付け、注記の字を `notePlacesOf` の置き場に書く。 */
export function drawAnnotations(chart: ChartInstance): void {
  const { ctx } = chart
  const color = resolveColor(chart.canvas, "--state-ng")
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = RING_WIDTH
  chartMarksOf(chart).annotations.forEach(({ series, index, text }) => {
    notePlacesOf(chart, series, index, ctx.measureText(text).width).forEach((place) => {
      ctx.beginPath()
      ctx.arc(place.ring.x, place.ring.y, RING_RADIUS, 0, Math.PI * 2)
      ctx.stroke()
      ctx.textAlign = place.align
      ctx.textBaseline = place.baseline
      ctx.fillText(text, place.text.x, place.text.y)
    })
  })
  ctx.restore()
}

type NotePlace = {
  readonly ring: { readonly x: number; readonly y: number }
  readonly text: { readonly x: number; readonly y: number }
  readonly align: CanvasTextAlign
  readonly baseline: CanvasTextBaseline
}

/**
 * 輪と字の置き場所（名指しが外れて描けなければ空）。折れ線は点の下（収まらなければ上）で、点が右半分なら左へ・左半分なら右へ伸ばす。
 * 縦棒は輪を棒の頭の内側に置いて字を棒の右隣（収まらなければ左隣）へ、横棒は輪を棒の端の内側に置いて字を棒の下の隙間へ、
 * share は輪を部分の上辺に置いて字をその上へ、arrow は輪を前か後の端に置いて字を線の下へ書く。
 * 棒の頭・端の外には値の字があるので、輪はそこへ出さない。
 */
function notePlacesOf(
  chart: ChartInstance,
  series: number,
  index: number,
  textWidth: number,
): readonly NotePlace[] {
  const { chartArea } = chart
  const middle = (chartArea.left + chartArea.right) / 2
  const inset = RING_RADIUS + RING_WIDTH
  const mode = directLabelOptionOf(chart)?.mode
  if (mode === "arrow") {
    const bar = chart.getDatasetMeta(0).data[index]
    const pair: unknown = chart.data.datasets[0]?.data[index]
    const pairScale = chart.scales["x"]
    const value = Array.isArray(pair) ? pair[series] : undefined
    if (bar === undefined || pairScale === undefined || typeof value !== "number") {
      return []
    }
    return [belowPoint(pairScale.getPixelForValue(value), bar.y, middle, chartArea.bottom)]
  }
  const bar = chart.getDatasetMeta(series).data[index]
  if (bar === undefined || !chart.isDatasetVisible(series)) {
    return []
  }
  if (chart.config.type !== "bar") {
    return [belowPoint(bar.x, bar.y, middle, chartArea.bottom)]
  }
  const horizontal = chart.options.indexAxis === "y"
  const scale = chart.scales["x"]
  if (mode === "share" && scale !== undefined) {
    const before = chart.data.datasets
      .slice(0, series)
      .reduce((sum, { data }) => sum + (typeof data[0] === "number" ? data[0] : 0), 0)
    const center = (scale.getPixelForValue(before) + bar.x) / 2
    const top = bar.y - bar.height / 2
    return [
      {
        ring: { x: center, y: top },
        text: {
          x: Math.min(
            Math.max(center, chartArea.left + textWidth / 2),
            chartArea.right - textWidth / 2,
          ),
          y: top - RING_RADIUS - 2,
        },
        align: "center",
        baseline: "bottom",
      },
    ]
  }
  if (horizontal) {
    return [
      {
        ring: { x: bar.x - inset, y: bar.y },
        text: { x: bar.x, y: bar.y + bar.height / 2 + 2 },
        align: "right",
        baseline: "top",
      },
    ]
  }
  const fitsRight = bar.x + bar.width / 2 + NOTE_GAP + textWidth <= chartArea.right
  return [
    {
      ring: { x: bar.x, y: bar.y + inset },
      text: {
        x: bar.x + (fitsRight ? 1 : -1) * (bar.width / 2 + NOTE_GAP),
        y: bar.y + inset,
      },
      align: fitsRight ? "left" : "right",
      baseline: "middle",
    },
  ]
}

function belowPoint(x: number, y: number, middle: number, bottom: number): NotePlace {
  const toLeft = x > middle
  const below = y + NOTE_GAP + NOTE_LINE_HEIGHT <= bottom
  return {
    ring: { x, y },
    text: { x: x + (toLeft ? -NOTE_GAP : NOTE_GAP), y: y + (below ? NOTE_GAP : -NOTE_GAP) },
    align: toLeft ? "right" : "left",
    baseline: below ? "top" : "bottom",
  }
}
