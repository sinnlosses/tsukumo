// 本文の型つきフェンス（`graph`・`mermaid`・`table`・`code`・`callout`・`claims`・`image`）を塊に読む。
// 塊は schema の出力の形で組み、中身で決まる制約は schema と同じ shared の定数・述語で確かめる。
// 通らないものは undefined（呼ぶ側が素のコードブロックに落として数える）。

import type { z } from "zod"

import { readGraphSource } from "../../../../shared/report/graph-source.ts"
import {
  MIN_TABLE_COLUMNS,
  MIN_TABLE_ROWS,
  type tableBlockSchema,
} from "../../../../shared/report/report-block-comparison.ts"
import {
  hasGraphNode,
  type imageBlockSchema,
  type graphBlockSchema,
  type mermaidBlockSchema,
} from "../../../../shared/report/report-block-diagram.ts"
import {
  type claimsBlockSchema,
  type codeBlockSchema,
  hasRequiredHowToVerify,
  isReportClaimCertainty,
  isReportNoteTone,
  MIN_CLAIM_ITEMS,
  type noteBlockSchema,
} from "../../../../shared/report/report-block-prose.ts"

/** 本文の型つきフェンスの種類（`figure` は `readFigureFence` が読む）。 */
export const READER_FENCE_KINDS = [
  "graph",
  "mermaid",
  "table",
  "code",
  "callout",
  "claims",
  "image",
] as const

type ReaderFenceKind = (typeof READER_FENCE_KINDS)[number]

type CodeBlock = z.output<typeof codeBlockSchema>

type ClaimItem = z.output<typeof claimsBlockSchema>["items"][number]

type ReadBlock =
  | z.output<typeof graphBlockSchema>
  | z.output<typeof mermaidBlockSchema>
  | z.output<typeof tableBlockSchema>
  | CodeBlock
  | z.output<typeof noteBlockSchema>
  | z.output<typeof claimsBlockSchema>
  | z.output<typeof imageBlockSchema>

/** `rest` は種類の語の後ろの info string、`content` はフェンスの中身（行を改行でつないだもの）。 */
export function readTypedFence(
  kind: ReaderFenceKind,
  rest: string,
  content: string,
): ReadBlock | undefined {
  switch (kind) {
    case "graph":
      return readGraphSource(content).brokenLines.length > 0 || !hasGraphNode(content)
        ? undefined
        : {
            kind: "graph",
            title: "",
            direction: "TD",
            source: content,
            legend: [],
            fold: "",
            aside: "",
          }
    case "mermaid":
      return content.trim() === ""
        ? undefined
        : { kind: "mermaid", title: "", source: content, fold: "", aside: "" }
    case "table":
      return readTable(rest, content)
    case "code":
      return readCode(rest, content)
    case "callout": {
      const tone = rest.trim()
      const text = content.trim()
      return text === "" || !isReportNoteTone(tone)
        ? undefined
        : { kind: "note", tone, text, fold: "", aside: "" }
    }
    case "claims":
      return readClaims(content)
    case "image":
      return readImage(rest, content)
  }
}

function readTable(title: string, content: string): ReadBlock | undefined {
  const rows = content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(tableCells)
  const [columns, separator, ...body] = rows
  if (
    columns === undefined ||
    separator === undefined ||
    !separator.every((cell) => /^:?-+:?$/.test(cell)) ||
    body.some((row) => row.length !== columns.length) ||
    columns.length < MIN_TABLE_COLUMNS ||
    body.length < MIN_TABLE_ROWS
  ) {
    return undefined
  }
  return {
    kind: "table",
    title: title.trim(),
    columns,
    rows: body,
    rest: "",
    fold: "",
    aside: "",
  }
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function readCode(rest: string, content: string): ReadBlock | undefined {
  const [language, path] = rest.trim().split(/\s+/)
  if (language === undefined || language === "") {
    return undefined
  }
  const block: Omit<CodeBlock, "path"> = {
    kind: "code",
    language,
    source: content,
    marks: [],
    fold: "",
    aside: "",
  }
  return path === undefined ? { ...block, path: "" } : { ...block, path }
}

function readClaims(content: string): ReadBlock | undefined {
  const lines = content.split("\n").filter((line) => line.trim() !== "")
  const items = lines.flatMap(readClaim)
  return items.length !== lines.length || items.length < MIN_CLAIM_ITEMS
    ? undefined
    : { kind: "claims", items, fold: "", aside: "" }
}

/** 読めた行は1件、読めない行は0件。 */
function readClaim(line: string): readonly ClaimItem[] {
  const [certainty, claim, ...notes] = line.split("|").map((cell) => cell.trim())
  if (certainty === undefined || claim === undefined || !isReportClaimCertainty(certainty)) {
    return []
  }
  const item = { claim, certainty, ...claimNotes(notes) }
  return hasRequiredHowToVerify(item) ? [item] : []
}

function claimNotes(notes: readonly string[]): Pick<ClaimItem, "basis" | "howToVerify"> {
  const [basis, howToVerify] = notes
  if (basis === undefined) {
    return { basis: "", howToVerify: "" }
  }
  return howToVerify === undefined ? { basis, howToVerify: "" } : { basis, howToVerify }
}

/** 中身の先頭の行が画像のパス、残りの行が notes。caption は info string の残り。 */
function readImage(caption: string, content: string): ReadBlock | undefined {
  const [path, ...notes] = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
  return path === undefined
    ? undefined
    : { kind: "image", path, caption: caption.trim(), notes, fold: "", aside: "" }
}
