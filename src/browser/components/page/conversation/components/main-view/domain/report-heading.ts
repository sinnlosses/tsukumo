// 本文の DOM から読める見出し（`##` の `h4` と `###` の `h5`）を拾う。
// 見出しの一覧と読み位置が同じ見出しの並びを数えるために、拾い方を1か所に置く。

import { REVEAL_PENDING_ATTRIBUTE } from "../../../../../../domain/reveal/paint.ts"
import { detailBlockClassName } from "../../markdown/markdown.tsx"

const HEADING_SELECTOR = `.${detailBlockClassName} :is(h4, h5)`

/** 畳んだ `<details>` の中と、筆がまだ届いていない節の中を除いた見出し。 */
export function readableHeadings(content: HTMLElement): readonly HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>(HEADING_SELECTOR)].filter(
    (heading) =>
      heading.closest("details:not([open])") === null &&
      heading.closest(`[${REVEAL_PENDING_ATTRIBUTE}="pending"]`) === null,
  )
}
