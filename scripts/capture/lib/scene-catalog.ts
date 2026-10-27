import { sumBy } from "remeda"

import { FIGURE_WEIGHT, SHORT_REPORT_WEIGHT } from "../../../src/browser/domain/reveal/plan.ts"
import type { FakeSession } from "../../../src/server/session-driver/adapter/fake-session.ts"
import { reportEvents } from "../../../src/server/session-driver/core/sdk-report-message.ts"
import {
  type TableCell,
  tableRowCells,
} from "../../../src/shared/report/report-block-comparison.ts"
import type { ReportBlock, SectionBlock } from "../../../src/shared/report/report-block.ts"
import { blocksWithChildrenOf, leafBlocksOf } from "../../../src/shared/report/row-panel-block.ts"

/** `table` の塊のうち、状態のセル（`{ status, text }`）を1つでも持つものに付ける印。 */
const TABLE_WITH_STATUS = "table(status)"

/** 検証結果（`report` の `checks`）が1件以上あるときに積む印。 */
const CHECKS = "checks"

export type RevealForecast = "likely" | "unlikely"

/**
 * 疑似セッションの場面（`turns[].name`）ごとに、`report` に出る塊の `kind` を集める。
 * `table` は状態のセルの有無で `"table"` と `"table(status)"` を分ける。
 */
export function sceneBlockKinds(session: FakeSession): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>()
  for (const scene of session.turns) {
    const kinds = new Set<string>()
    for (const step of scene.steps) {
      if (step.event.kind !== "report") {
        continue
      }
      // 疑似セッションの JSON は `report` ツールの生の呼び出しをそのまま持つ（`checks` などの
      // 省略可能な引数が無いままの形もある）。fake driver が配るときと同じ正規化を通す。
      const report = reportEvents(step.event.toolUseId, step.event, [])[0]
      if (report === undefined || report.kind !== "report") {
        continue
      }
      for (const section of report.sections) {
        for (const block of blocksWithChildrenOf(section.blocks)) {
          kinds.add(blockKindLabel(block))
        }
      }
      if (report.checks.length > 0) {
        kinds.add(CHECKS)
      }
    }
    result.set(scene.name, [...kinds])
  }
  return result
}

/** 場面ごとに、書き上げる演出が掛かる見込みを返す（節の重みの見積もり。描かないので正確ではない）。 */
export function revealForecast(session: FakeSession): ReadonlyMap<string, RevealForecast> {
  const result = new Map<string, RevealForecast>()
  for (const scene of session.turns) {
    const weights = scene.steps.flatMap((step) => {
      if (step.event.kind !== "report") {
        return []
      }
      const report = reportEvents(step.event.toolUseId, step.event, [])[0]
      if (report === undefined || report.kind !== "report") {
        return []
      }
      return [
        sumBy(
          report.sections.flatMap((section) => leafBlocksOf(section.blocks)),
          blockWeight,
        ),
      ]
    })
    result.set(
      scene.name,
      weights.some((weight) => weight >= SHORT_REPORT_WEIGHT) ? "likely" : "unlikely",
    )
  }
  return result
}

/** 描くと図になる塊。重みは文字数ではなく {@link FIGURE_WEIGHT} で数える。 */
const FIGURE_BLOCK_KINDS: ReadonlySet<string> = new Set([
  "mermaid",
  "svg",
  "image",
  "chart",
  "graph",
  "beforeAfter",
  "timeline",
])

function blockWeight(block: ReportBlock): number {
  return FIGURE_BLOCK_KINDS.has(block.kind) ? FIGURE_WEIGHT : textLength(block)
}

/** 塊の中の文字列の長さの合計（`kind` と `style` の値は描かないので数えない）。 */
function textLength(value: unknown): number {
  if (typeof value === "string") {
    return value.length
  }
  if (Array.isArray(value)) {
    return sumBy(value, textLength)
  }
  if (typeof value === "object" && value !== null) {
    return sumBy(
      Object.entries(value).filter(([key]) => key !== "kind" && key !== "style"),
      ([, child]) => textLength(child),
    )
  }
  return 0
}

function blockKindLabel(block: SectionBlock): string {
  return block.kind === "table" && block.rows.some((row) => tableRowCells(row).some(hasStatus))
    ? TABLE_WITH_STATUS
    : block.kind
}

function hasStatus(cell: TableCell): boolean {
  return typeof cell === "object" && "status" in cell
}
