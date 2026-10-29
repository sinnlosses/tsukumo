import type { ReportBlockSection } from "../../src/shared/report/report-block.ts"
import { reportSectionsMarkdown as reportSectionsMarkdownFrom } from "../../src/shared/report/report-markdown.ts"

/** 描いた `report` の本文と同じく、画像を棚から引く本文に組む。 */
export function reportSectionsMarkdown(sections: readonly ReportBlockSection[]): string {
  return reportSectionsMarkdownFrom(sections, {
    kind: "shelved",
    toolUseId: "fictional-report",
    sizes: [],
    unshelved: [],
  })
}
