import { buildReportCatalogDocument } from "../../../shared/report/a2ui-report-catalog.ts"

/** AI に渡すカタログ文書の JSON 文字列。 */
export function reportCatalogText(): string {
  return JSON.stringify(buildReportCatalogDocument())
}
