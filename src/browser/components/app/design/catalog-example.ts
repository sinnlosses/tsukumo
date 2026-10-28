// カタログの部品の例（`PART_EXAMPLES`）を、レポートの本文として描ける一覧にする。

import {
  type A2uiReportComponent,
  a2uiReportComponentSchema,
} from "../../../../shared/report/a2ui-report-catalog.ts"
import { PART_EXAMPLES } from "../../../../shared/report/part-example-list.ts"

const GALLERY_SECTION_ID = "gallery-section"

/**
 * 部品の名前ごとの、受理の形にした例。
 * 根の `Report` を持つ例はそのまま、根の無い例は `Report`（`root`）→ `Section` で包む。
 * 先頭が `Section` の例は、その `Section` を根の子にする。
 */
export const CATALOG_EXAMPLES: Readonly<Record<string, readonly A2uiReportComponent[]>> =
  Object.fromEntries(
    Object.entries(PART_EXAMPLES).map(([name, parts]) => [
      name,
      wrapped(parts.map((part) => a2uiReportComponentSchema.parse(part))),
    ]),
  )

function wrapped(parts: readonly A2uiReportComponent[]): readonly A2uiReportComponent[] {
  const entry = parts[0]
  if (entry === undefined || entry.component === "Report") {
    return parts
  }
  const root = a2uiReportComponentSchema.parse({
    id: "root",
    component: "Report",
    children: [entry.component === "Section" ? entry.id : GALLERY_SECTION_ID],
  })
  if (entry.component === "Section") {
    return [root, ...parts]
  }
  const section = a2uiReportComponentSchema.parse({
    id: GALLERY_SECTION_ID,
    component: "Section",
    heading: "例",
    children: topLevelIds(parts),
  })
  return [root, section, ...parts]
}

/** ほかの部品の子として引かれていない部品の ID（例の中で並べる単位）。 */
function topLevelIds(parts: readonly A2uiReportComponent[]): readonly string[] {
  const referenced = new Set(
    parts.flatMap((part) => {
      switch (part.component) {
        case "Row":
        case "Column":
        case "Section":
          return part.children
        case "Card":
          return [part.child]
        case "Tabs":
          return part.tabs.map((tab) => tab.child)
        default:
          return []
      }
    }),
  )
  return parts.filter((part) => !referenced.has(part.id)).map((part) => part.id)
}
