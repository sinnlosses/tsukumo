// テストが使う、手で書いた架空の `a2ui` の版の部品。駆動と同じく形の検査を通して受理の形にする。

import {
  type A2uiReportComponent,
  a2uiReportComponentSchema,
} from "../../src/shared/report/a2ui-report-catalog.ts"

/** 部品の入力を受理の形にする（省いた欄は既定の値で埋まる）。 */
export function a2uiParts(...inputs: readonly unknown[]): readonly A2uiReportComponent[] {
  return inputs.map((input) => a2uiReportComponentSchema.parse(input))
}

/** 根 → 節2つ → 葉3つの、届く順に並べた一覧。 */
export const STAGED_PARTS = a2uiParts(
  {
    id: "root",
    component: "Report",
    conclusion: ["架空の結論。"],
    children: ["s1", "s2"],
  },
  { id: "s1", component: "Section", heading: "架空の節一", children: ["p1", "p2"] },
  { id: "p1", component: "Paragraph", text: "架空の段落一" },
  { id: "p2", component: "Paragraph", text: "架空の段落二" },
  { id: "s2", component: "Section", heading: "架空の節二", children: ["p3"] },
  { id: "p3", component: "Paragraph", text: "架空の段落三" },
)
