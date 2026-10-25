// `graph` の塊の `source`（1行1項目の文字の記法）を、節点の並びと辺の並びに読む。

export type GraphNodeShape = "box" | "round" | "decision"

export type GraphChange = "unchanged" | "added" | "removed" | "changed"

const CHANGE_MARKS = [
  ["+ ", "added"],
  ["- ", "removed"],
  ["~ ", "changed"],
] as const satisfies readonly (readonly [string, GraphChange])[]

/** 行末の ` @a`〜` @e` で付ける色の意味の目印。`none` は付けていない。 */
export type GraphTone = "none" | "a" | "b" | "c" | "d" | "e"

const TONE_SUFFIX = /\s@([a-e])$/

export type GraphSourceNode = {
  readonly name: string
  readonly shape: GraphNodeShape
  /** 節点だけの行に付いた印。辺の行の印は端の節点に掛けない。 */
  readonly change: GraphChange
  /** 節点だけの行に付いた色の目印。辺の行の目印は端の節点に掛けない。 */
  readonly tone: GraphTone
  /** 節点だけの行に `名前 | 説明` で書いた説明の1行。無ければ空。 */
  readonly note: string
}

/** `from` と `to` は `nodes` の添字。 */
export type GraphSourceEdge = {
  readonly from: number
  readonly to: number
  readonly label: string
  readonly change: GraphChange
  readonly tone: GraphTone
  /** `-.>` で書いた点線の辺。 */
  readonly dashed: boolean
  /** `A <- B` で書いた戻り道（`from` が B、`to` が A）。 */
  readonly returns: boolean
}

/** 囲み（`[群の名]` 〜 `[]`）。`nodes` は `GraphSourceReading.nodes` の添字。 */
export type GraphSourceGroup = {
  readonly name: string
  readonly nodes: readonly number[]
  readonly tone: GraphTone
}

export type GraphSourceReading = {
  readonly nodes: readonly GraphSourceNode[]
  readonly edges: readonly GraphSourceEdge[]
  readonly groups: readonly GraphSourceGroup[]
  /** 読めなかった行の、1始まりの行番号（空行も数える）。 */
  readonly brokenLines: readonly number[]
}

/** 実線（`->`）・点線（`-.>`）・戻り道（`<-`）の矢印。分けると演算子も配列に残る。 */
const ARROW_OR_DASHED = /(-\.>|->|<-)/

const RETURN_ARROW = "<-"

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
  | { readonly kind: "group-open"; readonly name: string; readonly tone: GraphTone }
  | { readonly kind: "group-close" }
  | {
      readonly kind: "item"
      readonly names: readonly ParsedName[]
      readonly label: string
      readonly change: GraphChange
      readonly tone: GraphTone
      readonly dashed: boolean
      readonly returns: boolean
      readonly note: string
    }

export function readGraphSource(source: string): GraphSourceReading {
  const nodes: GraphSourceNode[] = []
  const wrappedNames = new Set<string>()
  const edges: GraphSourceEdge[] = []
  const brokenLines: number[] = []
  const indexOf = (parsed: ParsedName): number => {
    const found = nodes.findIndex((node) => node.name === parsed.name)
    if (found < 0) {
      nodes.push({
        name: parsed.name,
        shape: parsed.shape,
        change: "unchanged",
        tone: "none",
        note: "",
      })
    } else if (parsed.wrapped && !wrappedNames.has(parsed.name)) {
      nodes[found] = {
        name: parsed.name,
        shape: parsed.shape,
        change: nodes[found]?.change ?? "unchanged",
        tone: nodes[found]?.tone ?? "none",
        note: nodes[found]?.note ?? "",
      }
    }
    if (parsed.wrapped) {
      wrappedNames.add(parsed.name)
    }
    return found < 0 ? nodes.length - 1 : found
  }
  const groups: GraphSourceGroup[] = []
  const groupOf = new Map<string, number>()
  let open:
    | {
        readonly name: string
        readonly tone: GraphTone
        readonly line: number
        readonly members: number[]
      }
    | undefined
  const closeGroup = (): void => {
    if (open === undefined) {
      return
    }
    if (open.members.length === 0) {
      brokenLines.push(open.line)
    } else {
      groups.push({ name: open.name, nodes: open.members, tone: open.tone })
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
        open = { name: line.name, tone: line.tone, line: index + 1, members: [] }
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
        if (
          line.names.length === 1 &&
          only !== undefined &&
          (line.change !== "unchanged" || line.tone !== "none" || line.note !== "")
        ) {
          const earlierNode = nodes.find((node) => node.name === only.name)
          const earlier = earlierNode?.change ?? "unchanged"
          const earlierTone = earlierNode?.tone ?? "none"
          const earlierNote = earlierNode?.note ?? ""
          if (
            (earlier !== "unchanged" && line.change !== "unchanged" && earlier !== line.change) ||
            (earlierTone !== "none" && line.tone !== "none" && earlierTone !== line.tone) ||
            (earlierNote !== "" && line.note !== "" && earlierNote !== line.note)
          ) {
            brokenLines.push(index + 1)
            return
          }
          const at = indexOf(only)
          const node = nodes[at]
          if (node !== undefined) {
            nodes[at] = {
              ...node,
              change: node.change === "unchanged" ? line.change : node.change,
              tone: node.tone === "none" ? line.tone : node.tone,
              note: node.note === "" ? line.note : node.note,
            }
          }
          claim()
          return
        }
        const [left, right] = line.names.map(indexOf)
        if (left !== undefined && right !== undefined) {
          // `A <- B` は B から A へ戻る辺。節点の並びは書いた順のまま、辺の向きだけを B → A にする。
          edges.push({
            from: line.returns ? right : left,
            to: line.returns ? left : right,
            label: line.label,
            change: line.change,
            tone: line.tone,
            dashed: line.dashed,
            returns: line.returns,
          })
        }
        claim()
      }
    }
  })
  if (open !== undefined) {
    brokenLines.push(open.line)
    if (open.members.length > 0) {
      groups.push({ name: open.name, nodes: open.members, tone: open.tone })
    }
  }
  return { nodes, edges, groups, brokenLines: brokenLines.toSorted((a, b) => a - b) }
}

function parseLine(text: string): ParsedLine {
  const written = text.trim()
  if (written === "") {
    return { kind: "blank" }
  }
  const toneMatch = TONE_SUFFIX.exec(written)
  const tone = toneToken(toneMatch?.[1])
  const trimmed = toneMatch === null ? written : written.slice(0, toneMatch.index).trim()
  // 色の目印は行末の1つだけ。名前やラベルの中の ` @` は読めない行にする。
  if (trimmed === "[]") {
    return tone === "none" ? { kind: "group-close" } : { kind: "broken" }
  }
  if (/\s@/.test(trimmed)) {
    return { kind: "broken" }
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const name = trimmed.slice(1, -1).trim()
    return name === "" || /[[\]:]/.test(name) || ARROW_OR_DASHED.test(name)
      ? { kind: "broken" }
      : { kind: "group-open", name, tone }
  }
  const mark = CHANGE_MARKS.find(([prefix]) => trimmed.startsWith(prefix))
  const change = mark?.[1] ?? "unchanged"
  const line = mark === undefined ? trimmed : trimmed.slice(mark[0].length).trim()
  const parts = line.split(ARROW_OR_DASHED)
  if (parts.length === 1) {
    const [nameText = "", ...noteParts] = line.split("|")
    const note = noteParts[0]?.trim() ?? ""
    const name = parseName(nameText)
    return name === undefined || noteParts.length > 1 || (noteParts.length === 1 && note === "")
      ? { kind: "broken" }
      : {
          kind: "item",
          names: [name],
          label: "",
          change,
          tone,
          dashed: false,
          returns: false,
          note,
        }
  }
  const [left, arrow, right] = parts
  if (parts.length !== 3 || left === undefined || right === undefined) {
    return { kind: "broken" }
  }
  const colon = right.indexOf(":")
  const target = colon < 0 ? right : right.slice(0, colon)
  const label = colon < 0 ? "" : right.slice(colon + 1).trim()
  // 説明の `|` は節点だけの行のもの。辺の端の名前には書けない（ラベルの `|` は文字として通す）。
  const from = left.includes("|") ? undefined : parseName(left)
  const to = target.includes("|") ? undefined : parseName(target)
  if (from === undefined || to === undefined) {
    return { kind: "broken" }
  }
  const returns = arrow === RETURN_ARROW
  return {
    kind: "item",
    names: [from, to],
    label,
    change,
    tone,
    dashed: arrow === "-.>",
    returns,
    note: "",
  }
}

function toneToken(letter: string | undefined): GraphTone {
  switch (letter) {
    case "a":
    case "b":
    case "c":
    case "d":
    case "e":
      return letter
    default:
      return "none"
  }
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
