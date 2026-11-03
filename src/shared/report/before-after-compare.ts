// 旧い `BeforeAfter`（a2ui の部品と、`components` 以前の `beforeAfter` の塊）を、`Compare` の `before-after` に写す。

import type { A2uiReportComponent } from "./a2ui-report-catalog.ts"

type ComparePart = Extract<A2uiReportComponent, { readonly component: "Compare" }>

/** `BeforeAfter` の部品は `Compare` に写し、ほかの部品はそのまま返す。 */
export function compareOfBeforeAfter(part: A2uiReportComponent): A2uiReportComponent {
  return part.component === "BeforeAfter"
    ? ({ id: part.id, ...beforeAfterCompareFields(part) } satisfies ComparePart)
    : part
}

/** 見比べの部品（`Compare`・写す前の `BeforeAfter`）の側。ほかの部品は空。 */
export function comparisonSidesOf(part: A2uiReportComponent): ComparePart["sides"] {
  const compared = compareOfBeforeAfter(part)
  return compared.component === "Compare" ? compared.sides : []
}

/** 前後の欄を `Compare` の props（`id` を除く）にする。側の見出しは空で、札は「前」「後」になる。 */
export function beforeAfterCompareFields<Side extends object>(fields: {
  readonly title: string
  readonly before: Side
  readonly after: Side
  readonly fold: string
  readonly aside: string
}) {
  return {
    component: "Compare" as const,
    title: fields.title,
    relation: "before-after" as const,
    sides: [
      { ...fields.before, heading: "" },
      { ...fields.after, heading: "" },
    ],
    fold: fields.fold,
    aside: fields.aside,
  }
}
