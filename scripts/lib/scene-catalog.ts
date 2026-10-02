import type { FakeSession } from "../../src/server/session-driver/adapter/fake-driver.ts"
import { reportEvents } from "../../src/server/session-driver/core/sdk-message.ts"
import type { ReportBlock } from "../../src/shared/report/report-block.ts"

/** `table` の塊のうち、状態のセル（`{ status, text }`）を1つでも持つものに付ける印。 */
const TABLE_WITH_STATUS = "table(status)"

/** 検証結果（`report` の `checks`）が1件以上あるときに積む印。 */
const CHECKS = "checks"

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
        for (const block of section.blocks) {
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

type TableCell = Extract<ReportBlock, { readonly kind: "table" }>["rows"][number][number]

function blockKindLabel(block: ReportBlock): string {
  return block.kind === "table" && block.rows.some((row) => row.some(hasStatus))
    ? TABLE_WITH_STATUS
    : block.kind
}

function hasStatus(cell: TableCell): boolean {
  return typeof cell === "object" && "status" in cell
}
