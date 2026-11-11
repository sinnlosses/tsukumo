// いま選んでいる字のうち、レポートの本文の中にあるものを、口を出す位置と一緒に取り出す。

/** レポートの本文の器に付ける印の名前。JSX の属性名に定数を書けないので、器の側は同じ綴りを直に置く。 */
const REPORT_BODY_ATTRIBUTE = "data-report-body"

export type ReportSelection = {
  readonly text: string
  /** 選んだ範囲を含むいちばん内側の要素。 */
  readonly element: Element
  /** 選択の最後の行の矩形（ビューポートの座標）。 */
  readonly anchor: {
    readonly left: number
    readonly right: number
    readonly top: number
    readonly bottom: number
  }
}

/** 折りたたまれておらず、空白だけでもなく、全体がレポートの本文の中にある選択だけを返す。 */
export function reportSelectionOf(selection?: Selection): ReportSelection | undefined {
  if (selection === undefined || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined
  }
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const element = container instanceof Element ? container : container.parentElement
  if (element === null || element.closest(`[${REPORT_BODY_ATTRIBUTE}]`) === null) {
    return undefined
  }
  const text = selection.toString()
  if (text.trim() === "") {
    return undefined
  }
  const last = Array.from(range.getClientRects()).at(-1)
  if (last === undefined) {
    return undefined
  }
  return {
    text,
    element,
    anchor: { left: last.left, right: last.right, top: last.top, bottom: last.bottom },
  }
}
