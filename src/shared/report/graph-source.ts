// `graph` の塊の `source`（1行1項目の文字の記法）を、節点の並びと辺の並びに読む。

export type GraphNodeShape = "box" | "round" | "decision"

export type GraphSourceNode = {
  readonly name: string
  readonly shape: GraphNodeShape
}

/** `from` と `to` は `nodes` の添字。 */
export type GraphSourceEdge = {
  readonly from: number
  readonly to: number
  readonly label: string
}

export type GraphSourceReading = {
  readonly nodes: readonly GraphSourceNode[]
  readonly edges: readonly GraphSourceEdge[]
  /** 読めなかった行の、1始まりの行番号（空行も数える）。 */
  readonly brokenLines: readonly number[]
}

const ARROW = "->"

/** `-` や `=>` だけの語。矢印を書き損じた行を節点の宣言と読まないために弾く。 */
const STRAY_ARROW = /(?:^|\s)(?:-+>?|=+>|→)(?:\s|$)/

type ParsedName = {
  readonly name: string
  readonly shape: GraphNodeShape
  /** 包み（`(…)`・`{…}`）で書かれた名前。 */
  readonly wrapped: boolean
}

type ParsedLine =
  | { readonly kind: "blank" }
  | { readonly kind: "broken" }
  | {
      readonly kind: "item"
      readonly names: readonly ParsedName[]
      readonly label: string
    }

export function readGraphSource(source: string): GraphSourceReading {
  const nodes: GraphSourceNode[] = []
  const wrappedNames = new Set<string>()
  const edges: GraphSourceEdge[] = []
  const brokenLines: number[] = []
  const indexOf = (parsed: ParsedName): number => {
    const found = nodes.findIndex((node) => node.name === parsed.name)
    if (found < 0) {
      nodes.push({ name: parsed.name, shape: parsed.shape })
    } else if (parsed.wrapped && !wrappedNames.has(parsed.name)) {
      nodes[found] = { name: parsed.name, shape: parsed.shape }
    }
    if (parsed.wrapped) {
      wrappedNames.add(parsed.name)
    }
    return found < 0 ? nodes.length - 1 : found
  }
  source.split("\n").forEach((text, index) => {
    const line = parseLine(text)
    switch (line.kind) {
      case "blank":
        return
      case "broken":
        brokenLines.push(index + 1)
        return
      case "item": {
        const [from, to] = line.names.map(indexOf)
        if (from !== undefined && to !== undefined) {
          edges.push({ from, to, label: line.label })
        }
      }
    }
  })
  return { nodes, edges, brokenLines }
}

function parseLine(text: string): ParsedLine {
  const line = text.trim()
  if (line === "") {
    return { kind: "blank" }
  }
  const parts = line.split(ARROW)
  if (parts.length === 1) {
    const name = parseName(line)
    return name === undefined ? { kind: "broken" } : { kind: "item", names: [name], label: "" }
  }
  const [left, right] = parts
  if (parts.length !== 2 || left === undefined || right === undefined) {
    return { kind: "broken" }
  }
  const colon = right.indexOf(":")
  const target = colon < 0 ? right : right.slice(0, colon)
  const label = colon < 0 ? "" : right.slice(colon + 1).trim()
  const from = parseName(left)
  const to = parseName(target)
  if (from === undefined || to === undefined || label.includes(":")) {
    return { kind: "broken" }
  }
  return { kind: "item", names: [from, to], label }
}

function parseName(text: string): ParsedName | undefined {
  const trimmed = text.trim()
  if (trimmed.includes(":") || STRAY_ARROW.test(trimmed)) {
    return undefined
  }
  const name = unwrap(trimmed)
  return name.name === "" ? undefined : name
}

function unwrap(text: string): ParsedName {
  if (text.startsWith("(") && text.endsWith(")")) {
    return { name: text.slice(1, -1).trim(), shape: "round", wrapped: true }
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    return { name: text.slice(1, -1).trim(), shape: "decision", wrapped: true }
  }
  return { name: text, shape: "box", wrapped: false }
}
