// mermaid の図を描き終わるまで枠に持たせる高さ（px）を、ソースから見積もる。
// 縦に流れる flowchart は段数、sequenceDiagram はメッセージ数から寄せ、ほかは行数の目安に落とす。
// 係数は mermaid 11.15.0 の既定の配置で測った実測（1段 98px、1メッセージ 46px）。

/**
 * 描いた SVG を `<pre>` に差したときに SVG の高さへ足される分から、`<pre>` の上下の余白（16px）を引いたもの。
 * `min-height` は余白を含まない高さなので、余白を足し戻すと描いた後の高さに揃う。
 */
const FRAME_EXTRA_PX = 8
const FALLBACK_LINE_PX = 24
const FALLBACK_EXTRA_PX = 18

const RANK_PX = 98
const RANK_BASE_PX = -34
const SEQUENCE_BASE_PX = 220
const SEQUENCE_MESSAGE_PX = 46

const FLOW_HEAD = /^\s*(?:flowchart|graph)\b\s*(\w*)/
const FLOW_SKIPPED =
  /^\s*(?:%%|style\b|classDef\b|class\b|linkStyle\b|click\b|subgraph\b|end\b|direction\b)/
const FLOW_ARROW = /\s*(?:-->|---|-\.->|-\.-|==>|===)\s*(?:\|[^|]*\|)?\s*/
const SEQUENCE_MESSAGE = /^[^%]*?(?:-->>|->>|--x|-x|--\)|-\))/
const NODE_ID = /^\s*([\w-]+)/

export function mermaidFrameHeight(code: string): number {
  const lines = code.split("\n")
  const head = lines[0] ?? ""
  if (/^\s*sequenceDiagram\b/.test(head)) {
    const messages = lines.slice(1).filter((line) => SEQUENCE_MESSAGE.test(line)).length
    if (messages > 0) {
      return SEQUENCE_BASE_PX + SEQUENCE_MESSAGE_PX * messages + FRAME_EXTRA_PX
    }
  }
  const flow = FLOW_HEAD.exec(head)
  if (flow !== null && !["LR", "RL"].includes(flow[1] ?? "")) {
    const ranks = flowRanks(lines.slice(1))
    if (ranks > 0) {
      return RANK_PX * ranks + RANK_BASE_PX + FRAME_EXTRA_PX
    }
  }
  return lines.length * FALLBACK_LINE_PX + FALLBACK_EXTRA_PX
}

/** 辺の並びから、いちばん長い道の節点数を数える（輪があれば辿りきった所で止める）。 */
function flowRanks(lines: readonly string[]): number {
  const next = new Map<string, Set<string>>()
  for (const line of lines) {
    if (FLOW_SKIPPED.test(line)) {
      continue
    }
    const ids = line
      .split(FLOW_ARROW)
      .map((part) => NODE_ID.exec(part)?.[1])
      .filter((id): id is string => id !== undefined)
    if (ids.length < 2) {
      continue
    }
    for (const [index, from] of ids.entries()) {
      const to = ids[index + 1]
      if (to !== undefined) {
        next.set(from, (next.get(from) ?? new Set()).add(to))
      }
    }
  }
  const memo = new Map<string, number>()
  const longest = (id: string, visiting: ReadonlySet<string>): number => {
    const cached = memo.get(id)
    if (cached !== undefined) {
      return cached
    }
    const following = [...(next.get(id) ?? [])].filter((to) => !visiting.has(to))
    const length =
      1 + Math.max(0, ...following.map((to) => longest(to, new Set([...visiting, id]))))
    memo.set(id, length)
    return length
  }
  return Math.max(0, ...[...next.keys()].map((id) => longest(id, new Set())))
}
