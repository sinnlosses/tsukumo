import { Catalog } from "@a2ui/web_core/v0_9"

import { buildReportCatalogDocument } from "../../../../../../../shared/report/a2ui-report-catalog.ts"

/** カタログ文書を A2UI が読む部品の定義にする（描画の実装は別に足す）。 */
export function loadReportCatalogApis() {
  return Catalog.fromJson(buildReportCatalogDocument(), "v0.9")
}
