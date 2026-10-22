// 項目の並び（`list`・`progress`・`options`・`claims`）の塊を Markdown と HTML に組む。

import type { ReportBlock } from "./report-block.ts"
import {
  htmlAttribute,
  htmlInlineWithCode,
  joinParts,
  markdownInline,
} from "./report-inline-markdown.ts"
import { PAUSE_POINT_CLASS_NAME } from "./report-pause-point.ts"

/** 候補の判定 → 行の class と、頭に出す語。「採る」は筆を留める対象。 */
const OPTION_VERDICTS = {
  adopt: { rowClass: `option option-adopt ${PAUSE_POINT_CLASS_NAME}`, label: "採る" },
  consider: { rowClass: "option option-consider", label: "検討" },
  reject: { rowClass: "option option-reject", label: "採らない" },
} as const satisfies Record<
  Extract<ReportBlock, { readonly kind: "options" }>["items"][number]["verdict"],
  { readonly rowClass: string; readonly label: string }
>

type ClaimsBlock = Extract<ReportBlock, { readonly kind: "claims" }>

/** 主張の確度 → 行の class と、頭に出す記号と語。 */
const CLAIM_CERTAINTIES = {
  confirmed: { rowClass: "claim claim-confirmed", mark: "✓", label: "確定" },
  inferred: { rowClass: "claim claim-inferred", mark: "〜", label: "推測" },
  unverified: { rowClass: "claim claim-unverified", mark: "？", label: "未確認" },
} as const satisfies Record<
  ClaimsBlock["items"][number]["certainty"],
  { readonly rowClass: string; readonly mark: string; readonly label: string }
>

type ListBlock = Extract<ReportBlock, { readonly kind: "list" }>

/**
 * 名前（`label`）が1つでもある並びは、Markdown の並びのまま名前と説明を `span` に分けて容れ物で包む
 * （名前と説明の2列に揃えるのは CSS。`style` の印と説明の inline の記法はそのまま効く）。
 */
export function listMarkdown(block: ListBlock): string {
  const style = block.style
  if (style === "flow") {
    return flowMarkdown(block)
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

type ProgressStepState = "done" | "current" | "upcoming"

const PROGRESS_STATE_LABELS = {
  done: "済",
  current: "進行中",
  upcoming: "まだ",
} satisfies Record<ProgressStepState, string>

/**
 * 節（丸）と線でつないだ1本の道。段の名前が空文字なら1始まりの番号を名前にする。
 * 見分けは丸の中身（✓／輪と点／空の輪）と `aria-current`・`aria-label` が持ち、名前の字の色は補助。
 */
export function progressMarkdown(
  block: Extract<ReportBlock, { readonly kind: "progress" }>,
): string {
  const items = block.steps.flatMap((step, index) => {
    const ordinal = index + 1
    const state: ProgressStepState =
      index < block.current ? "done" : index === block.current ? "current" : "upcoming"
    const label = step.trim() !== "" ? step : String(ordinal)
    const stepHtml = progressStepMarkdown(state, label)
    return index === 0 ? [stepHtml] : [progressLineMarkdown(index - 1 < block.current), stepHtml]
  })
  return `<ol class="progress" aria-label="進み具合">${items.join("")}</ol>`
}

/**
 * 候補を書き手の順のまま1案1行にし、番号・判定の語・名前・理由の順に並べる。
 * 採る → 検討 → 採らないの順は書き手が守り、崩れていれば `reportViolations` が差し戻す（並べ替えは再構成になるのでしない）。
 */
export function optionsMarkdown(block: Extract<ReportBlock, { readonly kind: "options" }>): string {
  const rows = block.items.map(({ name, verdict, reason }, index) => {
    const { rowClass, label } = OPTION_VERDICTS[verdict]
    const reasonHtml =
      reason === "" ? "" : ` <span class="option-reason">${htmlInlineWithCode(reason)}</span>`
    return `<div class="${rowClass}"><span class="option-number">${String(index + 1)}</span><span class="option-verdict">${label}</span><span class="option-body"><span class="option-name">${htmlInlineWithCode(name)}</span>${reasonHtml}</span></div>`
  })
  return joinParts([
    block.title.trim() === "" ? "" : `**${markdownInline(block.title)}**`,
    `<div class="options">${rows.join("")}</div>`,
  ])
}

/**
 * 主張を書き手の順のまま1項目1行にし、確度（記号と語）・主張・根拠・確かめ方の順に並べる。空の根拠と確かめ方は欄ごと出さない。
 * 行の中身は div の内側を空行で挟んだ段落にする（`path:line` とリンクを Markdown の行内として効かせるため）。
 */
export function claimsMarkdown(block: ClaimsBlock): string {
  const rows = block.items.map(({ claim, certainty, basis, howToVerify }) => {
    const { rowClass, mark, label } = CLAIM_CERTAINTIES[certainty]
    const line = [
      `<span class="claim-certainty"><span class="claim-mark" aria-hidden="true">${mark}</span>${label}</span>`,
      `<span class="claim-text">${markdownInline(claim)}</span>`,
      claimFieldMarkdown("claim-basis", "根拠", basis),
      claimFieldMarkdown("claim-how", "確かめ方", howToVerify),
    ].join("")
    return `<div class="${rowClass}">\n\n${line}\n\n</div>`
  })
  return joinParts(['<div class="claims">', ...rows, "</div>"])
}

const FLOW_ROW_MAX_STEPS = 5
const FLOW_ROW_MAX_CHARS = 50

function flowFitsRow(items: ListBlock["items"]): boolean {
  return (
    items.length <= FLOW_ROW_MAX_STEPS &&
    items.every((item) => item.label.trim().length + item.text.length <= FLOW_ROW_MAX_CHARS)
  )
}

/**
 * 項目を番号の丸と1本の線でつないだ `<ol>` にする。名前があれば段の頭に太字で添える。
 * 段が少なく短いときは `flow-row`（横の箱の列）を足し、最後以外の段に矢印を付ける。縦へ落とすのは CSS。
 */
function flowMarkdown(block: ListBlock): string {
  const lastIndex = block.items.length - 1
  const row = flowFitsRow(block.items)
  const steps = block.items.map(({ label, text }, index) => {
    const name = label.trim() === "" ? "" : `<b>${htmlInlineWithCode(label)}</b>`
    const number = `<span class="flow-number" aria-hidden="true">${String(index + 1)}</span>`
    const rail = index === lastIndex ? "" : '<span class="flow-rail" aria-hidden="true"></span>'
    const arrow =
      row && index !== lastIndex ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""
    return `<li class="flow-step">${number}${rail}<span>${name}${htmlInlineWithCode(text)}</span>${arrow}</li>`
  })
  return `<ol class="${row ? "flow flow-row" : "flow"}" aria-label="流れ">${steps.join("")}</ol>`
}

function listMarker(
  style: Exclude<ListBlock["style"], "flow">,
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

function claimFieldMarkdown(className: string, name: string, text: string): string {
  return text.trim() === ""
    ? ""
    : `<span class="${className}"><span class="claim-field">${name}</span>${markdownInline(text)}</span>`
}

function progressLineMarkdown(done: boolean): string {
  const lineClass = done ? "progress-line progress-line-done" : "progress-line"
  return `<li class="${lineClass}" aria-hidden="true"></li>`
}

function progressStepMarkdown(state: ProgressStepState, label: string): string {
  const stepClass = state === "upcoming" ? "progress-step" : `progress-step progress-step-${state}`
  const current = state === "current" ? ' aria-current="step"' : ""
  const dot =
    state === "done"
      ? '<span class="progress-dot" aria-hidden="true">✓</span>'
      : state === "current"
        ? '<span class="progress-dot" aria-hidden="true"><span class="progress-dot-mark"></span></span>'
        : '<span class="progress-dot" aria-hidden="true"></span>'
  const status =
    state === "current"
      ? `<span class="progress-status">${PROGRESS_STATE_LABELS[state]}</span>`
      : ""
  return (
    `<li class="${stepClass}"${current} aria-label="${htmlAttribute(label)}：${PROGRESS_STATE_LABELS[state]}">` +
    `${dot}<span class="progress-name">${htmlInlineWithCode(label)}</span>${status}</li>`
  )
}
