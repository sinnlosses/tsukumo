import type { InquiryModel } from "../../../../../../stores/inquiry-answer.ts"

/** 等幅の札で出す項目の上限。超えたぶんは「ほか n」にまとめる。 */
const MAX_SHOWN_CHIPS = 6

export type PendingAskChips = {
  /** 全項目。板で全部を読むときに使う。 */
  readonly all: readonly string[]
  readonly shown: readonly string[]
  readonly omittedCount: number
}

/**
 * 質問は添え書きの図の塊のうち最初の `list` の項目、許可は対象の1行。
 * どちらも無ければ空。
 */
export function pendingAskChips(inquiry: InquiryModel): PendingAskChips {
  const all = chipTexts(inquiry)
  return {
    all,
    shown: all.slice(0, MAX_SHOWN_CHIPS),
    omittedCount: Math.max(0, all.length - MAX_SHOWN_CHIPS),
  }
}

function chipTexts(inquiry: InquiryModel): readonly string[] {
  if (inquiry.kind === "permission") {
    const line = inquiry.targetText.split(/\r?\n/).find((candidate) => candidate.trim() !== "")
    return line === undefined ? [] : [line.trim()]
  }
  if (inquiry.kind === "question") {
    for (const option of inquiry.options) {
      for (const figure of option.figures) {
        if (figure.kind === "list") {
          return figure.items.map((item) => (item.label === "" ? item.text : item.label))
        }
      }
    }
  }
  return []
}
