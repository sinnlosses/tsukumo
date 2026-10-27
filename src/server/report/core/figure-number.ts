// 本文に書かれた数と、`plot` の `Q` 列の値の照合。位置だけを返し、本文の字と列の名前は持たない。

import type { ReportPlot } from "../../../shared/report/figure-grammar.ts"

/** 本文から読んだ数。`percent` は末尾が `%`／`％`。 */
export type BodyNumber = { readonly value: number; readonly percent: boolean }

/** 不一致の位置。すべて 1 始まりで、`bodyNumber` は本文の数の並びでの位置。 */
export type FigureNumberSlip = {
  readonly plot: number
  readonly column: number
  readonly bodyNumber: number
}

const INLINE_CODE = /(`+)[\s\S]*?\1/g

const NUMBER_TOKEN = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([%％])?/g

/** 近い値の取り違えとみなす相対差の上限。 */
const NEAR_RATIO = 0.1

/** 小数 2 桁までの丸めの差。 */
const ROUNDING_TOLERANCE = 0.005 + 1e-9

const UNIT_EXPONENTS = [1, -1, 2, -2, 3, -3] as const

/** 文中の数を出現順に読む。インラインコードの中は読まず、符号は読まない。 */
export function numbersIn(text: string): readonly BodyNumber[] {
  return [...text.replace(INLINE_CODE, "").matchAll(NUMBER_TOKEN)].map((match) => ({
    value: Number(`${(match[1] ?? "").replaceAll(",", "")}${match[2] ?? ""}`),
    percent: match[3] !== undefined,
  }))
}

/**
 * 本文の数のうち、どの `plot` のどの `Q` 列の値とも一致せず、ある列の値とは取り違えとみなせるものを、
 * (plot, 列, 本文の数) の組で返す。どの列とも取り違えにならない数は返さない。
 */
export function figureNumberSlips(
  plots: readonly ReportPlot[],
  bodyNumbers: readonly BodyNumber[],
): readonly FigureNumberSlip[] {
  const plotColumns = plots.map(plotNumberColumns)
  return bodyNumbers.flatMap((bodyNumber, bodyIndex) => {
    const matched = plotColumns.some((columns) =>
      columns.some(({ values }) => values.some((value) => numberMatches(bodyNumber, value))),
    )
    return matched
      ? []
      : plotColumns.flatMap((columns, plotIndex) =>
          columns
            .filter(({ values }) => values.some((value) => numberSlips(bodyNumber, value)))
            .map(({ column }) => ({
              plot: plotIndex + 1,
              column,
              bodyNumber: bodyIndex + 1,
            })),
        )
  })
}

/** `Q` 列だけを、`data` での 1 始まりの位置つきで返す。 */
function plotNumberColumns(
  plot: ReportPlot,
): readonly { readonly column: number; readonly values: readonly number[] }[] {
  return plot.data.flatMap((column, index) =>
    column.type === "Q"
      ? [
          {
            column: index + 1,
            values: column.values.filter((value): value is number => typeof value === "number"),
          },
        ]
      : [],
  )
}

/** 小数 2 桁までの丸めの差で一致する。% つきの数は、そのままの値と 100 で割った値の両方で比べる。 */
function numberMatches(bodyNumber: BodyNumber, value: number): boolean {
  return (
    isRoundedEqual(bodyNumber.value, value) ||
    (bodyNumber.percent && isRoundedEqual(bodyNumber.value / 100, value))
  )
}

/** 一致しないが、近い値の取り違え（相対差 10% 以内）か、桁の単位違い（10 の ±1〜±3 乗）にあたる。 */
function numberSlips(bodyNumber: BodyNumber, value: number): boolean {
  if (value === 0 || bodyNumber.value === 0) {
    return false
  }
  return (
    Math.abs(bodyNumber.value - value) / Math.abs(value) <= NEAR_RATIO ||
    UNIT_EXPONENTS.some((exponent) => isRoundedEqual(bodyNumber.value * 10 ** exponent, value))
  )
}

function isRoundedEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= ROUNDING_TOLERANCE
}
