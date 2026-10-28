// 面の葉のうち、Markdown に戻さず部品が直接描くものの一覧。
// 一覧に無い葉は、これまでどおり葉の Markdown を欄の描画に通す。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportImageSource } from "../../../../../../shared/report/report-image-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { BeforeAfterLeaf } from "./before-after-leaf.tsx"
import { ChartLeaf } from "./chart-leaf.tsx"
import { ClaimsLeaf } from "./claims-leaf.tsx"
import { CodeLeaf } from "./code-leaf.tsx"
import { CompareLeaf } from "./compare-leaf.tsx"
import { GraphLeaf } from "./graph-leaf.tsx"
import { ItemListLeaf } from "./item-list-leaf.tsx"
import { MatrixLeaf } from "./matrix-leaf.tsx"
import { MermaidLeaf } from "./mermaid-leaf.tsx"
import { NoteLeaf } from "./note-leaf.tsx"
import { OptionsLeaf } from "./options-leaf.tsx"
import { ParagraphLeaf } from "./paragraph-leaf.tsx"
import { PictureLeaf } from "./picture-leaf.tsx"
import { PlotLeaf } from "./plot-leaf.tsx"
import { StatsLeaf } from "./stats-leaf.tsx"
import { SvgLeaf } from "./svg-leaf.tsx"
import { TableLeaf } from "./table-leaf.tsx"
import { TimelineLeaf } from "./timeline-leaf.tsx"

type DirectLeafViewProps = {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
  readonly imageSource: ReportImageSource
}

type DirectLeafView = (props: DirectLeafViewProps) => ReactElement

/** 部品名 → 直接描く部品。 */
const DIRECT_LEAF_VIEWS: ReadonlyMap<A2uiReportComponent["component"], DirectLeafView> = new Map([
  ["Paragraph", ParagraphLeaf],
  ["ItemList", ItemListLeaf],
  ["Claims", ClaimsLeaf],
  ["Note", NoteLeaf],
  ["Options", OptionsLeaf],
  ["Table", TableLeaf],
  ["Matrix", MatrixLeaf],
  ["Compare", CompareLeaf],
  ["Stats", StatsLeaf],
  ["Svg", SvgLeaf],
  ["Timeline", TimelineLeaf],
  ["Graph", GraphLeaf],
  ["Picture", PictureLeaf],
  ["BeforeAfter", BeforeAfterLeaf],
  ["Mermaid", MermaidLeaf],
  ["Chart", ChartLeaf],
  ["Plot", PlotLeaf],
  ["Code", CodeLeaf],
])

/** 葉を直接描く部品。無ければ undefined（Markdown の描画に通す葉）。 */
export function directLeafViewOf(
  part: A2uiReportComponent,
  views: ReadonlyMap<A2uiReportComponent["component"], DirectLeafView> = DIRECT_LEAF_VIEWS,
): DirectLeafView | undefined {
  return views.get(part.component)
}

/** 直接描く葉1つ。整形で落ちた葉は値を持たず、何も描かない。 */
export function DirectLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue | undefined
  readonly imageSource: ReportImageSource
  readonly view: DirectLeafView
}): ReactElement {
  const View = props.view
  return props.value === undefined ? (
    <></>
  ) : (
    <View part={props.part} value={props.value} imageSource={props.imageSource} />
  )
}
