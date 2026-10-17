// `graph` の塊の `source`（1行1項目の文字の記法）を、節点の並びと辺の並びに読む。

export type GraphNodeShape = "box" | "round" | "decision"

export type GraphChange = "unchanged" | "added" | "removed" | "changed"

const CHANGE_MARKS = [
  ["+ ", "added"],
  ["- ", "removed"],
  ["~ ", "changed"],
] as const satisfies readonly (readonly [string, GraphChange])[]

export type GraphSourceNode = {
  readonly name: string
  readonly shape: GraphNodeShape
  /** 節点だけの行に付いた印。辺の行の印は端の節点に掛けない。 */
  readonly change: GraphChange
}

/** `from` と `to` は `nodes` の添字。 */
export type GraphSourceEdge = {
  readonly from: number
  readonly to: number
  readonly label: string
  readonly change: GraphChange
}

/** 囲み（`[群の名]` 〜 `[]`）。`nodes` は `GraphSourceReading.nodes` の添字。 */
export type GraphSourceGroup = {
  readonly name: string
  readonly nodes: readonly number[]
}

export type GraphSourceReading = {
  readonly nodes: readonly GraphSourceNode[]
  readonly edges: readonly GraphSourceEdge[]
  readonly groups: readonly GraphSourceGroup[]
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
  | { readonly kind: "group-open"; readonly name: string }
  | { readonly kind: "group-close" }
  | {
      readonly kind: "item"
      readonly names: readonly ParsedName[]
      readonly label: string
      readonly change: GraphChange
    }

export function readGraphSource(source: string): GraphSourceReading {
  const nodes: GraphSourceNode[] = []
  const wrappedNames = new Set<string>()
  const edges: GraphSourceEdge[] = []
  const brokenLines: number[] = []
  const indexOf = (parsed: ParsedName): number => {
    const found = nodes.findIndex((node) => node.name === parsed.name)
    if (found < 0) {
      nodes.push({ name: parsed.name, shape: parsed.shape, change: "unchanged" })
    } else if (parsed.wrapped && !wrappedNames.has(parsed.name)) {
      nodes[found] = {
        name: parsed.name,
        shape: parsed.shape,
        change: nodes[found]?.change ?? "unchanged",
      }
    }
    if (parsed.wrapped) {
      wrappedNames.add(parsed.name)
    }
    return found < 0 ? nodes.length - 1 : found
  }
  const groups: GraphSourceGroup[] = []
  const groupOf = new Map<string, number>()
  let open: { readonly name: string; readonly line: number; readonly members: number[] } | undefined
  const closeGroup = (): void => {
    if (open === undefined) {
      return
    }
    if (open.members.length === 0) {
      brokenLines.push(open.line)
    } else {
      groups.push({ name: open.name, nodes: open.members })
    }
    open = undefined
  }
  source.split("\n").forEach((text, index) => {
    const line = parseLine(text)
    switch (line.kind) {
      case "blank":
        return
      case "broken":
        brokenLines.push(index + 1)
        return
      case "group-open":
        if (open !== undefined) {
          brokenLines.push(index + 1)
          return
        }
        open = { name: line.name, line: index + 1, members: [] }
        return
      case "group-close":
        if (open === undefined) {
          brokenLines.push(index + 1)
          return
        }
        closeGroup()
        return
      case "item": {
        const current = open
        const owner = groups.length
        if (
          current !== undefined &&
          line.names.some(({ name }) => (groupOf.get(name) ?? owner) !== owner)
        ) {
          brokenLines.push(index + 1)
          return
        }
        const claim = (): void => {
          if (current === undefined) {
            return
          }
          for (const { name } of line.names) {
            const at = nodes.findIndex((node) => node.name === name)
            if (!current.members.includes(at)) {
              current.members.push(at)
              groupOf.set(name, owner)
            }
          }
        }
        const [only] = line.names
        if (line.names.length === 1 && only !== undefined && line.change !== "unchanged") {
          const earlier = nodes.find((node) => node.name === only.name)?.change ?? "unchanged"
          if (earlier !== "unchanged" && earlier !== line.change) {
            brokenLines.push(index + 1)
            return
          }
          const at = indexOf(only)
          const node = nodes[at]
          if (node !== undefined && node.change === "unchanged") {
            nodes[at] = { ...node, change: line.change }
          }
          claim()
          return
        }
        const [from, to] = line.names.map(indexOf)
        if (from !== undefined && to !== undefined) {
          edges.push({ from, to, label: line.label, change: line.change })
        }
        claim()
      }
    }
  })
  if (open !== undefined) {
    brokenLines.push(open.line)
    if (open.members.length > 0) {
      groups.push({ name: open.name, nodes: open.members })
    }
  }
  return { nodes, edges, groups, brokenLines: brokenLines.toSorted((a, b) => a - b) }
}

function parseLine(text: string): ParsedLine {
  const trimmed = text.trim()
  if (trimmed === "") {
    return { kind: "blank" }
  }
  if (trimmed === "[]") {
    return { kind: "group-close" }
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const name = trimmed.slice(1, -1).trim()
    return name === "" || /[[\]:]/.test(name) || name.includes(ARROW)
      ? { kind: "broken" }
      : { kind: "group-open", name }
  }
  const mark = CHANGE_MARKS.find(([prefix]) => trimmed.startsWith(prefix))
  const change = mark?.[1] ?? "unchanged"
  const line = mark === undefined ? trimmed : trimmed.slice(mark[0].length).trim()
  const parts = line.split(ARROW)
  if (parts.length === 1) {
    const name = parseName(line)
    return name === undefined
      ? { kind: "broken" }
      : { kind: "item", names: [name], label: "", change }
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
  return { kind: "item", names: [from, to], label, change }
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
