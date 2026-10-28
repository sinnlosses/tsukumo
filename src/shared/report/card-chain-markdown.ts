// 5 節点以下の一本道の `graph` を、mermaid ではなくカードの連鎖（HTML）で組む。

import {
  readGraphSource,
  type GraphChange,
  type GraphSourceReading,
  type GraphTone,
} from "./graph-source.ts"
import { htmlInline } from "./report-inline-markdown.ts"

const MAX_CARDS = 5

/** 連鎖の1要素。カードと、カードのあいだの矢印が交互に並ぶ。 */
export type CardChainItem =
  | {
      readonly kind: "card"
      readonly change: GraphChange
      readonly tone: GraphTone
      readonly name: string
      readonly note: string
    }
  | {
      readonly kind: "arrow"
      readonly change: GraphChange
      readonly tone: GraphTone
      readonly label: string
    }

/** カードの連鎖の要素の並び。一本道でなければ `undefined`（呼ぶ側が mermaid に回す）。 */
export function cardChainOf(source: string): readonly CardChainItem[] | undefined {
  const reading = readGraphSource(source)
  const order = cardChainOrder(reading)
  if (order === undefined) {
    return undefined
  }
  return order.flatMap((at, position): readonly CardChainItem[] => {
    const node = reading.nodes[at]
    if (node === undefined) {
      return []
    }
    const card: CardChainItem = {
      kind: "card",
      change: node.change,
      tone: node.tone,
      name: node.name,
      note: node.note,
    }
    const next = order[position + 1]
    const edge =
      next === undefined ? undefined : reading.edges.find((e) => e.from === at && e.to === next)
    return edge === undefined
      ? [card]
      : [card, { kind: "arrow", change: edge.change, tone: edge.tone, label: edge.label }]
  })
}

/** カードの連鎖の HTML。 */
export function cardChainHtml(chain: readonly CardChainItem[]): string {
  const items = chain.map((item) => {
    if (item.kind === "card") {
      const classes = [
        "card-chain-card",
        ...(item.change === "unchanged" ? [] : [`card-chain-${item.change}`]),
      ]
      const tone =
        item.tone === "none"
          ? ""
          : `<span class="card-chain-tone card-chain-tone-${item.tone}" aria-hidden="true"></span>`
      const note =
        item.note === "" ? "" : `<span class="card-chain-note">${htmlInline(item.note)}</span>`
      return `<li class="${classes.join(" ")}">${tone}<span class="card-chain-name">${htmlInline(item.name)}</span>${note}</li>`
    }
    const arrowClasses = [
      "card-chain-arrow",
      ...(item.tone === "none" ? [] : [`card-chain-tone-${item.tone}`]),
      ...(item.change === "unchanged" ? [] : [`card-chain-${item.change}`]),
    ]
    const label =
      item.label === "" ? "" : `<span class="card-chain-edge">${htmlInline(item.label)}</span>`
    return `<li class="${arrowClasses.join(" ")}" aria-hidden="true">${label}</li>`
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
