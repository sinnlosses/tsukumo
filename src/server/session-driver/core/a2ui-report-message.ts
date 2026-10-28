// `report` の `a2ui` の版の引数（部品の平らな一覧 `components`）を、旧い版の引数の形に組み直す。
// 組み直した引数は旧い版と同じ取り出し（`reportEvents`）を通る。
//
// 会話の内容がここを通る。
// 持ち出す先は呼び出し側の `reportEvents` だけで、ログにもファイルにも書かない。

import {
  type A2uiReportComponent,
  a2uiReportComponentSchema,
} from "../../../shared/report/a2ui-report-catalog.ts"
import { a2uiReportFields } from "../../../shared/report/a2ui-report-input.ts"
import { A2UI_ROOT_ID, a2uiPartsById } from "../../../shared/report/a2ui-report-outline.ts"

/** 組み直した結果。`input` は旧い版の引数の形、`droppedCount` は部品の形に合わず落とした要素の数。 */
export type A2uiReportInput = {
  readonly input: Readonly<Record<string, unknown>>
  readonly components: readonly A2uiReportComponent[]
  readonly droppedCount: number
}

/**
 * 部品の一覧を組み直す。部品の形に合わない要素は落として数える。
 * 欄への写し方は {@link a2uiReportFields}。構造の規約に外れた一覧も落ちずに写す。根が無ければ欄の無い引数になる。
 */
export function a2uiReportInput(components: readonly unknown[]): A2uiReportInput {
  const parsed = components.flatMap((component) => {
    const result = a2uiReportComponentSchema.safeParse(component)
    return result.success ? [result.data] : []
  })
  const byId = a2uiPartsById(parsed)
  const root = byId.get(A2UI_ROOT_ID)
  return {
    input: root?.component === "Report" ? a2uiReportFields(root, byId) : {},
    components: parsed,
    droppedCount: components.length - parsed.length,
  }
}
