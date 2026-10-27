// 数直線と bullet の入力から、軸の範囲と各印の位置（0〜1 の割合）を決める。座標は書き手から受け取らない。

import type { GaugeSpec } from "../../../../../../../shared/report/plot-gauge.ts"

/** 軸の両端に空ける割合。端の印と字が枠から切れないようにする。 */
const EDGE = 0.04

/** 端に寄った字を内側へ伸ばす境。 */
const ANCHOR_EDGE = 0.18

/** 項目名の字数の上限。超えたら末尾を「…」にして、同じ行の値と重ならないようにする。 */
const LABEL_MAX = 18

const ROW_HEIGHT = 44
const AXIS_HEIGHT = 24
const NUMBER_LINE_HEIGHT = 64

export type GaugeAnchor = "start" | "middle" | "end"

export type GaugeAxis = {
  readonly min: number
  readonly max: number
}

type NumberLinePoint = {
  /** 並びの中で一意な印。 */
  readonly key: string
  readonly at: number
  readonly text: string
  /** 最小と最大の印だけ値を札にする。 */
  readonly labelled: boolean
  readonly anchor: GaugeAnchor
}

type BulletBand = {
  readonly key: string
  readonly from: number
  readonly to: number
  /** 0 が最も濃く、1 が最も薄い。 */
  readonly shade: number
}

type BulletRowLayout = {
  readonly key: string
  readonly top: number
  readonly label: string
  readonly valueAt: number
  readonly valueText: string
  readonly targetAt: number
  readonly bands: readonly BulletBand[]
}

type GaugeFrame = {
  readonly title: string
  readonly unit: string
  readonly axis: GaugeAxis
  readonly minAt: number
  readonly maxAt: number
  readonly height: number
}

type GaugeLayout =
  | (GaugeFrame & {
      readonly kind: "numberLine"
      readonly points: readonly NumberLinePoint[]
    })
  | (GaugeFrame & {
      readonly kind: "bullet"
      readonly rows: readonly BulletRowLayout[]
      /** 下の軸の両端の字と、それを置く縦位置。 */
      readonly axisTextY: number
      readonly minText: string
      readonly maxText: string
    })

export function gaugeLayoutOf(spec: GaugeSpec): GaugeLayout {
  if (spec.kind === "numberLine") {
    const axis = axisOf(spec.values, false)
    const lowest = spec.values.indexOf(Math.min(...spec.values))
    const highest = spec.values.indexOf(Math.max(...spec.values))
    return {
      kind: "numberLine",
      title: spec.title,
      unit: spec.unit,
      height: NUMBER_LINE_HEIGHT,
      axis,
      minAt: positionOf(axis, axis.min),
      maxAt: positionOf(axis, axis.max),
      points: spec.values.map((value, index) => {
        const at = positionOf(axis, value)
        return {
          key: `point-${String(index)}`,
          at,
          text: valueText(value),
          labelled: index === lowest || index === highest,
          anchor: anchorOf(at),
        }
      }),
    }
  }
  const axis = axisOf(
    spec.rows.flatMap((row) => [row.value, row.target, ...row.bands.map((band) => band.upTo)]),
    true,
  )
  return {
    kind: "bullet",
    title: spec.title,
    unit: spec.unit,
    height: spec.rows.length * ROW_HEIGHT + AXIS_HEIGHT,
    axisTextY: spec.rows.length * ROW_HEIGHT + 14,
    minText: valueText(axis.min),
    maxText: `${valueText(axis.max)} ${spec.unit}`,
    axis,
    minAt: positionOf(axis, axis.min),
    maxAt: positionOf(axis, axis.max),
    rows: spec.rows.map((row, rowIndex) => {
      const ends = row.bands.map((band) => band.upTo).toSorted((a, b) => a - b)
      return {
        key: `row-${String(rowIndex)}`,
        top: rowIndex * ROW_HEIGHT,
        label: truncated(row.label),
        valueAt: positionOf(axis, row.value),
        valueText: valueText(row.value),
        targetAt: positionOf(axis, row.target),
        bands: ends.map((end, index) => ({
          key: `band-${String(index)}`,
          from: positionOf(axis, index === 0 ? axis.min : (ends[index - 1] ?? axis.min)),
          to: positionOf(axis, end),
          shade: ends.length === 1 ? 0 : index / (ends.length - 1),
        })),
      }
    }),
  }
}

/** 値を字にする。小数は 2 桁までに丸める。 */
export function valueText(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function truncated(label: string): string {
  const letters = [...label]
  return letters.length <= LABEL_MAX ? label : `${letters.slice(0, LABEL_MAX - 1).join("")}…`
}

/** 値の最小〜最大を含む範囲。`includeZero` なら 0 を含める。1 点・同じ値だけでも幅を持たせる。 */
export function axisOf(values: readonly number[], includeZero: boolean): GaugeAxis {
  const low = Math.min(...values, ...(includeZero ? [0] : []))
  const high = Math.max(...values, ...(includeZero ? [0] : []))
  if (high > low) return { min: low, max: high }
  return { min: low - 1, max: high + 1 }
}

export function positionOf(axis: GaugeAxis, value: number): number {
  return EDGE + ((value - axis.min) / (axis.max - axis.min)) * (1 - 2 * EDGE)
}

export function anchorOf(at: number): GaugeAnchor {
  if (at < ANCHOR_EDGE) return "start"
  return at > 1 - ANCHOR_EDGE ? "end" : "middle"
}

export function percent(at: number): string {
  return `${String(at * 100)}%`
}
