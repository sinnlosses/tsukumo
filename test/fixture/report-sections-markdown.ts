import { reportSectionsMarkdown as reportSectionsMarkdownFrom } from "../../src/browser/components/page/conversation/domain/report-markdown.ts"
import type { FigureBlock } from "../../src/shared/report/report-block.ts"

/** 描いた `report` の本文と同じく、画像を棚から引く本文に組む。 */
export function reportSectionsMarkdown(
  sections: readonly { readonly heading: string; readonly blocks: readonly FigureBlock[] }[],
): string {
  return reportSectionsMarkdownFrom(sections, {
    kind: "shelved",
    toolUseId: "fictional-report",
    sizes: [],
    unshelved: [],
  })
}
