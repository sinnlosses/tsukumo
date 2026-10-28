// 数の塊（`stats`）を HTML に組む。

import type { ReportBlock } from "./report-block.ts"
import { htmlInlineWithCode } from "./report-inline-markdown.ts"
import {
  STAT_SPARK_HEIGHT,
  STAT_SPARK_RADIUS,
  STAT_SPARK_WIDTH,
  type StatLayout,
  statLayoutOf,
} from "./stat-layout.ts"

type StatItem = Extract<ReportBlock, { readonly kind: "stats" }>["items"][number]

const BEFORE_CLASS_NAMES = {
  plain: "stat-before",
  better: "stat-before stat-better",
  worse: "stat-before stat-worse",
} as const satisfies Record<StatLayout["beforeTone"], string>

/** 結論の直下に置く数の札（`keyFigures`）。札は `stats` と同じで、包みの `key-figures` だけが違う。無ければ空文字。 */
export function keyFiguresMarkdown(items: readonly StatItem[]): string {
  return items.length === 0
    ? ""
    : `<div class="key-figures"><div class="stats">${items.map(statMarkdown).join("")}</div></div>`
}

export function statMarkdown(item: StatItem): string {
  const { before, value, total, label } = item
  const layout = statLayoutOf(item)
  const beforeHtml =
    before.trim() === ""
      ? ""
      : `<span class="${BEFORE_CLASS_NAMES[layout.beforeTone]}">${htmlInlineWithCode(before)} →</span>`
  const totalHtml =
    total.trim() === "" ? "" : `<span class="stat-total"> / ${htmlInlineWithCode(total)}</span>`
  return `<div class="stat">${beforeHtml}<b>${statSparkMarkdown(layout.spark)}${htmlInlineWithCode(value)}${totalHtml}</b>${statMeterMarkdown(layout.meter)}${htmlInlineWithCode(label)}</div>`
}

function statSparkMarkdown(spark: StatLayout["spark"]): string {
  if (spark.kind === "none") {
    return ""
  }
  const path = spark.points.map(({ x, y }) => `${String(x)},${String(y)}`).join(" ")
  return (
    `<svg viewBox="0 0 ${String(STAT_SPARK_WIDTH)} ${String(STAT_SPARK_HEIGHT)}" aria-hidden="true">` +
    `<polyline points="${path}"/>` +
    `<circle cx="${String(spark.last.x)}" cy="${String(spark.last.y)}" r="${String(STAT_SPARK_RADIUS)}"/></svg>`
  )
}

function statMeterMarkdown(meter: StatLayout["meter"]): string {
  return meter.kind === "none"
    ? ""
    : `<span class="stat-meter" aria-hidden="true"><span class="stat-meter-fill" style="width: ${String(meter.percent)}%"></span></span>`
}
