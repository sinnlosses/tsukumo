// 本文の DOM から読める見出し（`##` の `h4` と `###` の `h5`）を拾う。
// 見出しの一覧と読み位置が同じ見出しの並びを数えるために、拾い方を1か所に置く。

import { REVEAL_PENDING_ATTRIBUTE } from "../../../../../../domain/reveal/paint.ts"
import { detailBlockClassName } from "../../markdown/markdown.tsx"

const HEADING_SELECTOR = `.${detailBlockClassName} :is(h4, h5)`

/** 節の欄の入れ物が欄の ID を持つ属性（`Report` が付ける）。 */
const SECTION_ATTRIBUTE = "data-report-section"

/** 目次の見出し1つ。`section` は `##`、`sub` は `###` と、節の中で書かれた余分な `##`。 */
export type OutlineItem = {
  readonly element: HTMLElement
  readonly level: "section" | "sub"
  readonly text: string
}

/** 畳んだ `<details>` の中と、筆がまだ届いていない節の中を除いた見出し。 */
export function readableHeadings(content: HTMLElement): readonly HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>(HEADING_SELECTOR)].filter(
    (heading) =>
      heading.closest("details:not([open])") === null &&
      heading.closest(`[${REVEAL_PENDING_ATTRIBUTE}="pending"]`) === null,
  )
}

/**
 * 目次の行にする見出し。見出しのある節の欄（`headedSectionIds`）の最初の `h4` が `section`。
 * 欄の中のほかの `h4` は `sub`、欄の外の `h4` と見出しの無い節の欄の中の `h4` は `h4` なら `section`、`h5` なら `sub`。
 */
export function readableOutlineItems(
  content: HTMLElement,
  headedSectionIds: readonly number[],
): readonly OutlineItem[] {
  const items: OutlineItem[] = []
  const seenRegions = new Set<Element>()
  for (const element of readableHeadings(content)) {
    const text = element.textContent.trim()
    const isSection = element.tagName === "H4"
    const region = element.closest<HTMLElement>(`[${SECTION_ATTRIBUTE}]`)
    const id = Number(region?.getAttribute(SECTION_ATTRIBUTE))
    if (region === null || !headedSectionIds.includes(id)) {
      items.push({ element, level: isSection ? "section" : "sub", text })
      continue
    }
    const isFirst = !seenRegions.has(region)
    seenRegions.add(region)
    items.push({ element, level: isFirst && isSection ? "section" : "sub", text })
  }
  return items
}
