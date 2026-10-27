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
  /** 節点だけの行に `名前 | 説明` で書いた説明。`\n` で改行した行を実際の改行でつなぐ（3行まで）。無ければ空。 */
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

/**
 * 囲み（`[群の名]` 〜 `[]`）。`nodes` は `GraphSourceReading.nodes` の添字で、直に書いた節点だけ。
 * 入れ子は2階層まで。`inner` は直に入れた囲みの `GraphSourceReading.groups` の添字（内側が先に閉じるので外側より小さい）。
 */
export type GraphSourceGroup = {
  readonly name: string
  readonly nodes: readonly number[]
  readonly inner: readonly number[]
  readonly tone: GraphTone
}

export type GraphSourceReading = {
  readonly nodes: readonly GraphSourceNode[]
  readonly edges: readonly GraphSourceEdge[]
  readonly groups: readonly GraphSourceGroup[]
  /** 読めなかった行の、1始まりの行番号（空行も数える）。 */
  readonly brokenLines: readonly number[]
}

const GROUP_DEPTH_LIMIT = 2

const NOTE_LINE_LIMIT = 3

const NOTE_BREAK = "\\n"

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
  | { readonly kind: "broken-note" }
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
  const stack: OpenGroup[] = []
  let opened = 0
  // 3階層目以降の開きは読まずに飛ばすので、対の閉じも飛ばす。
  let skippedOpens = 0
  const finishGroup = (group: OpenGroup): void => {
    if (group.members.length === 0 && group.inner.length === 0) {
      return
    }
    groups.push({
      name: group.name,
      nodes: group.members,
      inner: group.inner,
      tone: group.tone,
    })
    stack.at(-1)?.inner.push(groups.length - 1)
  }
  source.split("\n").forEach((text, index) => {
    const line = parseLine(text)
    switch (line.kind) {
      case "blank":
        return
      case "broken":
        brokenLines.push(index + 1)
        return
      case "broken-note":
        brokenLines.push(index + 1)
        return
      case "group-open":
        if (skippedOpens > 0 || stack.length >= GROUP_DEPTH_LIMIT) {
          skippedOpens += 1
          brokenLines.push(index + 1)
          return
        }
        stack.push({
          id: opened,
          name: line.name,
          tone: line.tone,
          line: index + 1,
          members: [],
          inner: [],
        })
        opened += 1
        return
      case "group-close": {
        if (skippedOpens > 0) {
          skippedOpens -= 1
          return
        }
        const closing = stack.pop()
        if (closing === undefined) {
          brokenLines.push(index + 1)
          return
        }
        if (closing.members.length === 0 && closing.inner.length === 0) {
          brokenLines.push(closing.line)
          return
        }
        finishGroup(closing)
        return
      }
      case "item": {
        const current = stack.at(-1)
        const owner = current?.id ?? -1
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
  for (let unclosed = stack.pop(); unclosed !== undefined; unclosed = stack.pop()) {
    brokenLines.push(unclosed.line)
    finishGroup(unclosed)
  }
  return {
    nodes,
    edges,
    groups,
    brokenLines: brokenLines.toSorted((a, b) => a - b),
  }
}

type OpenGroup = {
  readonly id: number
  readonly name: string
  readonly tone: GraphTone
  readonly line: number
  readonly members: number[]
  readonly inner: number[]
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
    const noteText = noteParts[0]?.trim() ?? ""
    const noteLines = noteText.split(NOTE_BREAK).map((part) => part.trim())
    const name = parseName(nameText)
    if (
      name !== undefined &&
      noteParts.length === 1 &&
      (noteLines.length > NOTE_LINE_LIMIT || (noteLines.length > 1 && noteLines.includes("")))
    ) {
      return { kind: "broken-note" }
    }
    const note = noteLines.join("\n")
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
