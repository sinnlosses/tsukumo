import type { A2uiWrittenComponent } from "../../src/shared/report/a2ui-report-catalog.ts"
import { staticReportComponents } from "../../src/shared/report/report-static-component-list.ts"

/** イベントや記録の書いたままの一覧を、テストが初期値で評価した静的な一覧で読むための短い口。 */
export function staticOf(components: readonly A2uiWrittenComponent[]) {
  return staticReportComponents(components).components
}
