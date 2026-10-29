// `report` の `body`（Markdown）を、散文の塊と型つきフェンスの塊を本文の順に並べて読む。
// 読めない型つきフェンスは素のコードブロックに落とし、差し戻さず数える。

import { READER_FENCE_KINDS, readTypedFence } from "./body-fence-reader.ts"
import { readFigureFence } from "./body-figure-fence.ts"
import type { ReportBlock } from "./report-block.ts"

export type ParsedReportBody = {
  readonly blocks: readonly ReportBlock[]
  /** 型つきフェンスのうち、読めずに素のコードブロックに落としたものの数。 */
  readonly brokenFenceCount: number
}

type Segment =
  | { readonly kind: "prose"; readonly lines: readonly string[] }
  | {
      readonly kind: "fence"
      readonly type: string
      readonly rest: string
      readonly content: string
    }

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/
const TYPED_KINDS: readonly string[] = ["figure", ...READER_FENCE_KINDS]

/**
 * 型つきでない言語名のフェンスは散文の一部のまま残す（描く側が拾う）。
 * フェンスの無い本文は `markdown` の塊1つ。空白だけなら塊は無い。
 */
export function parseReportBody(body: string): ParsedReportBody {
  const entries = segmentsOf(body.split("\n")).flatMap(blockOf)
  return {
    blocks: entries.map((entry) => entry.block),
    brokenFenceCount: entries.filter((entry) => entry.broken).length,
  }
}

type Entry = { readonly block: ReportBlock; readonly broken: boolean }

function blockOf(segment: Segment): readonly Entry[] {
  if (segment.kind === "prose") {
    const markdown = segment.lines
      .join("\n")
      .replace(/^(?:[ \t]*\n)+/, "")
      .trimEnd()
    return markdown === ""
      ? []
      : [{ block: { kind: "markdown", markdown, fold: "", aside: "" }, broken: false }]
  }
  const block = readFence(segment)
  return [
    block === undefined
      ? {
          block: {
            kind: "code",
            language: "text",
            path: "",
            source: segment.content,
            marks: [],
            fold: "",
            aside: "",
          },
          broken: true,
        }
      : { block, broken: false },
  ]
}

function readFence(fence: Extract<Segment, { kind: "fence" }>): ReportBlock | undefined {
  if (fence.type === "figure") {
    return readFigureFence(fence.content)
  }
  const kind = READER_FENCE_KINDS.find((candidate) => candidate === fence.type)
  return kind === undefined ? undefined : readTypedFence(kind, fence.rest, fence.content)
}

/** 型つきフェンスで区切り、それ以外の行（型の無いフェンスも）は散文にまとめる。 */
function segmentsOf(lines: readonly string[]): readonly Segment[] {
  const segments: Segment[] = []
  let prose: string[] = []
  let index = 0
  while (index < lines.length) {
    const open = openingOf(lines[index] ?? "")
    if (open === undefined) {
      prose.push(lines[index] ?? "")
      index += 1
      continue
    }
    const closeAt = closingIndex(lines, index + 1, open.marker)
    const end = closeAt < 0 ? lines.length : closeAt + 1
    const fenceLines = lines.slice(index, end)
    if (TYPED_KINDS.includes(open.type)) {
      segments.push({ kind: "prose", lines: prose })
      prose = []
      segments.push({
        kind: "fence",
        type: open.type,
        rest: open.rest,
        content: lines.slice(index + 1, closeAt < 0 ? lines.length : closeAt).join("\n"),
      })
    } else {
      prose.push(...fenceLines)
    }
    index = end
  }
  segments.push({ kind: "prose", lines: prose })
  return segments
}

function openingOf(
  line: string,
): { readonly marker: string; readonly type: string; readonly rest: string } | undefined {
  const match = FENCE_OPEN.exec(line)
  const marker = match?.[1]
  if (marker === undefined) {
    return undefined
  }
  const info = (match?.[2] ?? "").trim()
  const [type = "", ...rest] = info.split(/\s+/)
  return { marker, type, rest: rest.join(" ") }
}

/** 開きと同じ文字を開き以上の数だけ並べた行（`fencedLineFlags` の閉じと同じ規則）。 */
function closingIndex(lines: readonly string[], from: number, marker: string): number {
  return lines.findIndex((line, at) => {
    const trimmed = line.trim()
    return (
      at >= from &&
      /^ {0,3}\S/.test(line) &&
      trimmed.length >= marker.length &&
      [...trimmed].every((char) => char === marker[0])
    )
  })
}
