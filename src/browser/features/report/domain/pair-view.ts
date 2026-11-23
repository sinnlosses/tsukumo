// 対（前と後）のある紙の、見せ方（並べる・後だけ・前だけ）の値と、その切り替えを置く対・切り替えの字。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { a2uiChildIds } from "../../../../shared/report/a2ui-report-outline.ts"

export type PairView = "side" | "after" | "before"

type PartsById = ReadonlyMap<string, A2uiReportComponent>

type BeforeAfterPart = Extract<A2uiReportComponent, { readonly component: "Compare" }>

const DEFAULT_SWITCH_LABELS = { after: "後だけ", before: "前だけ" } as const

/** 紙の描画順に並べた id（根の子）から、`before-after` の対の id を描画順に引く。入れ子の配置の部品も順に辿る。 */
export function beforeAfterPairIdsInOrder(
  orderedIds: readonly string[],
  parts: PartsById,
): readonly string[] {
  return orderedIds.flatMap((id): readonly string[] => {
    const part = parts.get(id)
    if (part === undefined) {
      return []
    }
    return isBeforeAfter(part) ? [id] : beforeAfterPairIdsInOrder(a2uiChildIds(part), parts)
  })
}

/**
 * 切り替えの「後だけ」「前だけ」の字。紙の `before-after` の全部で側の見出しが同じ非空の語なら、その語に合わせる。
 * 違う・空があるときは「後だけ」「前だけ」のまま。
 */
export function pairSwitchLabels(parts: PartsById): { after: string; before: string } {
  const pairs = [...parts.values()].filter(isBeforeAfter)
  return {
    after: uniformHeadingLabel(pairs, 1) || DEFAULT_SWITCH_LABELS.after,
    before: uniformHeadingLabel(pairs, 0) || DEFAULT_SWITCH_LABELS.before,
  }
}

/**
 * 全部の対で同じ非空の見出しなら「（見出し）だけ」。そうでなければ空。
 * 見出しの括弧書きは切り替えの字に入れず、括弧の前が長すぎれば空にする（切り替えの組が1行に収まるように）。
 */
function uniformHeadingLabel(pairs: readonly BeforeAfterPart[], index: number): string {
  const headings = new Set(pairs.map((pair) => switchWordOf(pair.sides[index]?.heading ?? "")))
  const [only = ""] = headings
  return headings.size === 1 && only !== "" ? `${only}だけ` : ""
}

const SWITCH_WORD_MAX_LENGTH = 8

function switchWordOf(heading: string): string {
  const [head = ""] = heading.split(/[（(]/u)
  const word = head.trim()
  return word.length > SWITCH_WORD_MAX_LENGTH ? "" : word
}

function isBeforeAfter(part: A2uiReportComponent): part is BeforeAfterPart {
  return part.component === "Compare" && part.relation === "before-after"
}
