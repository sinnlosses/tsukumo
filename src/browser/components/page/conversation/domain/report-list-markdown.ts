// 項目の並び（`list`）の塊を Markdown と HTML に組む。

import type { LeafComponent } from "../../../../../shared/report/report-block.ts"
import {
  htmlInlineWithCode,
  markdownInline,
} from "../../../../../shared/report/report-inline-markdown.ts"

type ListBlock = Extract<LeafComponent, { readonly kind: "list" }>

/**
 * 名前（`label`）が1つでもある並びは、Markdown の並びのまま名前と説明を `span` に分けて容れ物で包む
 * （名前と説明の2列に揃えるのは CSS。`style` の印と説明の inline の記法はそのまま効く）。
 */
export function listMarkdown(block: ListBlock): string {
  const style = block.style
  if (style === "flow") {
    return flowMarkdown(block)
  }
  if (style === "cards") {
    return cardsMarkdown(block)
  }
  const labeled = block.items.some((item) => item.label.trim() !== "")
  const lines = block.items.map((item, index) => {
    const marker = listMarker(style, index, item.done)
    return labeled
      ? `${marker} <span class="list-label">${markdownInline(item.label)}</span><span class="list-text">${markdownInline(item.text)}</span>`
      : `${marker} ${markdownInline(item.text)}`
  })
  return labeled ? `<div class="labeled-list">\n\n${lines.join("\n")}\n\n</div>` : lines.join("\n")
}

const FLOW_ROW_MAX_STEPS = 5
const FLOW_ROW_MAX_CHARS = 50

export function hasFlowDetail(item: ListBlock["items"][number]): boolean {
  return item.source.trim() !== "" || item.branch.trim() !== ""
}

/** 段が少なく短く、出どころも分岐も無い `flow` は横の箱の列（`flow-row`）に並べる。 */
export function flowFitsRow(items: ListBlock["items"]): boolean {
  return (
    items.length <= FLOW_ROW_MAX_STEPS &&
    items.every(
      (item) =>
        !hasFlowDetail(item) && item.label.trim().length + item.text.length <= FLOW_ROW_MAX_CHARS,
    )
  )
}

/**
 * 項目を番号の丸と1本の線でつないだ `<ol>` にする。名前があれば段の頭に太字で添える。
 * 段が少なく短いときは `flow-row`（横の箱の列）を足し、最後以外の段に矢印を付ける。縦へ落とすのは CSS。
 */
function flowMarkdown(block: ListBlock): string {
  const lastIndex = block.items.length - 1
  const row = flowFitsRow(block.items)
  const detailed = block.items.some(hasFlowDetail)
  const steps = block.items.map(({ label, text, source, branch, branchTone }, index) => {
    const name = label.trim() === "" ? "" : `<b>${htmlInlineWithCode(label)}</b>`
    const sourceHtml =
      source.trim() === "" ? "" : `<span class="flow-source">${htmlInlineWithCode(source)}</span>`
    const branchHtml =
      branch.trim() === ""
        ? ""
        : `<span class="flow-branch flow-branch-${branchTone}">${htmlInlineWithCode(branch)}</span>`
    const number = `<span class="flow-number" aria-hidden="true">${String(index + 1)}</span>`
    const rail = index === lastIndex ? "" : '<span class="flow-rail" aria-hidden="true"></span>'
    const arrow =
      row && index !== lastIndex ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""
    return `<li class="flow-step">${number}${rail}<span>${name}${htmlInlineWithCode(text)}${sourceHtml}${branchHtml}</span>${arrow}</li>`
  })
  const className = row ? "flow flow-row" : detailed ? "flow flow-detailed" : "flow"
  return `<ol class="${className}" aria-label="流れ">${steps.join("")}</ol>`
}

/** 項目ごとに太字の題の1行と本文の `card` を、項目数で等分する `cards` の容れ物に並べる。内側は空行で挟む。 */
function cardsMarkdown(block: ListBlock): string {
  const cards = block.items.map(
    ({ label, text }) =>
      `<div class="card">\n\n**${markdownInline(label)}**\n\n${markdownInline(text)}\n\n</div>`,
  )
  return `<div class="cards">\n\n${cards.join("\n\n")}\n\n</div>`
}

function listMarker(
  style: Exclude<ListBlock["style"], "flow" | "cards">,
  index: number,
  done: boolean,
): string {
  switch (style) {
    case "bullet":
      return "-"
    case "ordered":
      return `${index + 1}.`
    case "check":
      return done ? "- [x]" : "- [ ]"
  }
}
