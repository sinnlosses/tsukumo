// 面の葉のうち、Markdown に戻さず部品が直接描くものの一覧。
// 一覧に無い葉は、これまでどおり葉の Markdown を欄の描画に通す。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { ClaimsLeaf } from "./claims-leaf.tsx"
import { ItemListLeaf } from "./item-list-leaf.tsx"
import { NoteLeaf } from "./note-leaf.tsx"
import { OptionsLeaf } from "./options-leaf.tsx"
import { ParagraphLeaf } from "./paragraph-leaf.tsx"

type DirectLeafViewProps = {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}

type DirectLeafView = (props: DirectLeafViewProps) => ReactElement

/** 部品名 → 直接描く部品。 */
const DIRECT_LEAF_VIEWS: ReadonlyMap<A2uiReportComponent["component"], DirectLeafView> = new Map([
  ["Paragraph", ParagraphLeaf],
  ["ItemList", ItemListLeaf],
  ["Claims", ClaimsLeaf],
  ["Note", NoteLeaf],
  ["Options", OptionsLeaf],
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
  readonly view: DirectLeafView
}): ReactElement {
  const View = props.view
  return props.value === undefined ? <></> : <View part={props.part} value={props.value} />
}
