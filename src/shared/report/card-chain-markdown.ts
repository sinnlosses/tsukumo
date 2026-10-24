// 5 節点以下の一本道の `graph` を、mermaid ではなくカードの連鎖（HTML）で組む。

import { readGraphSource, type GraphSourceReading } from "./graph-source.ts"
import { htmlInline } from "./report-inline-markdown.ts"

const MAX_CARDS = 5

/** カードの連鎖の HTML。一本道でなければ `undefined`（呼ぶ側が mermaid に回す）。 */
export function cardChainHtml(source: string): string | undefined {
  const reading = readGraphSource(source)
  const order = cardChainOrder(reading)
  if (order === undefined) {
    return undefined
  }
  const items = order.flatMap((at, position) => {
    const node = reading.nodes[at]
    if (node === undefined) {
      return []
    }
    const classes = [
      "card-chain-card",
      ...(node.change === "unchanged" ? [] : [`card-chain-${node.change}`]),
    ]
    const tone =
      node.tone === "none"
        ? ""
        : `<span class="card-chain-tone card-chain-tone-${node.tone}" aria-hidden="true"></span>`
    const note =
      node.note === "" ? "" : `<span class="card-chain-note">${htmlInline(node.note)}</span>`
    const card = `<li class="${classes.join(" ")}">${tone}<span class="card-chain-name">${htmlInline(node.name)}</span>${note}</li>`
    const next = order[position + 1]
    const edge =
      next === undefined ? undefined : reading.edges.find((e) => e.from === at && e.to === next)
    if (edge === undefined) {
      return [card]
    }
    const arrowClasses = [
      "card-chain-arrow",
      ...(edge.tone === "none" ? [] : [`card-chain-tone-${edge.tone}`]),
      ...(edge.change === "unchanged" ? [] : [`card-chain-${edge.change}`]),
    ]
    const label =
      edge.label === "" ? "" : `<span class="card-chain-edge">${htmlInline(edge.label)}</span>`
    return [card, `<li class="${arrowClasses.join(" ")}" aria-hidden="true">${label}</li>`]
  })
  return `<ol class="card-chain" aria-label="連鎖">${items.join("")}</ol>`
}

/**
 * 一本道（分岐・合流・囲み・点線が無く、辺が節点数 − 1 本）で節点が 2〜5 のとき、始点から辿った節点の添字の並び。
 * 当たらなければ `undefined`。
 */
function cardChainOrder(reading: GraphSourceReading): readonly number[] | undefined {
  const { nodes, edges, groups } = reading
  if (
    groups.length > 0 ||
    nodes.length < 2 ||
    nodes.length > MAX_CARDS ||
    edges.length !== nodes.length - 1 ||
    edges.some((edge) => edge.dashed) ||
    nodes.some((node) => node.shape === "decision")
  ) {
    return undefined
  }
  const starts = nodes.flatMap((_, index) =>
    edges.some((edge) => edge.to === index) ? [] : [index],
  )
  const [start] = starts
  if (start === undefined || starts.length !== 1) {
    return undefined
  }
  const order = [start]
  for (let edge = edges.find((e) => e.from === start); edge !== undefined;) {
    const next = edge.to
    if (order.includes(next)) {
      return undefined
    }
    order.push(next)
    edge = edges.find((e) => e.from === next)
  }
  return order.length === nodes.length &&
    edges.every((e) => order.indexOf(e.to) > order.indexOf(e.from))
    ? order
    : undefined
}
