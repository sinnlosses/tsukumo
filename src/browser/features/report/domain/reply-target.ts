// 「聞く」が指した所（`ReplyTarget`）を、部品と行の字から組む。

import { foldInlineMarks } from "../../../../shared/report/inline-mark.ts"
import type { ReplyTarget } from "../../../../shared/session/reply-target.ts"

/** `replyTargetSchema` の `label` の各欄の上限に合わせる。 */
const MAX_LABEL_LENGTH = 500

type ReplyTargetInput = {
  readonly reportToolUseId: string
  readonly componentId: string
  /** 節の見出し。節の外・見出しの無い節は空。 */
  readonly section: string
  /** 部品の題。空なら `componentKind` を使う。 */
  readonly title: string
  readonly componentKind: string
  /** 行を指したときだけ。`index` は書き手が書いた並びでの添字。 */
  readonly row?: { readonly index: number; readonly firstCell: string }
}

export function replyTargetOf(input: ReplyTargetInput): ReplyTarget {
  const section = plainLabel(input.section)
  const title = plainLabel(input.title)
  const row = input.row === undefined ? "" : plainLabel(input.row.firstCell)
  return {
    label: {
      ...(section === "" ? {} : { section }),
      component: title === "" ? input.componentKind : title,
      ...(row === "" ? {} : { row }),
    },
    key: {
      reportToolUseId: input.reportToolUseId,
      componentId: input.componentId,
      ...(input.row === undefined ? {} : { rowIndex: input.row.index }),
    },
  }
}

function plainLabel(text: string): string {
  const folded = foldInlineMarks(text).replace(/\s+/g, " ").trim()
  return [...folded].slice(0, MAX_LABEL_LENGTH).join("")
}
