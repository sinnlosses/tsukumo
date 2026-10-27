// いま選んでいる字のうち、レポートの本文の中にあるものを、口を出す位置と一緒に取り出す。

/** レポートの本文の器に付ける印の名前。JSX の属性名に定数を書けないので、器の側は同じ綴りを直に置く。 */
const REPORT_BODY_ATTRIBUTE = "data-report-body"

export type ReportSelection = {
  readonly text: string
  /** 選択の最後の行の左端と下端（窓の座標）。 */
  readonly anchor: { readonly left: number; readonly bottom: number }
}

/** 折りたたまれておらず、空白だけでもなく、全体がレポートの本文の中にある選択だけを返す。 */
export function reportSelectionOf(selection: Selection | null): ReportSelection | undefined {
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
    return undefined
  }
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const element = container instanceof Element ? container : container.parentElement
  if ((element?.closest(`[${REPORT_BODY_ATTRIBUTE}]`) ?? undefined) === undefined) {
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
  return { text, anchor: { left: last.left, bottom: last.bottom } }
}
