// 本文の型つきフェンス（`graph`・`mermaid`・`table`・`code`・`callout`・`claims`・`image`）を塊に読む。
// 検査は塊の schema に任せ、通らないものは undefined（呼ぶ側が素のコードブロックに落として数える）。

import type { z } from "zod"

import { readGraphSource } from "./graph-source.ts"
import { tableBlockSchema } from "./report-block-comparison.ts"
import { imageBlockSchema, graphBlockSchema, mermaidBlockSchema } from "./report-block-diagram.ts"
import { claimsBlockSchema, codeBlockSchema, noteBlockSchema } from "./report-block-prose.ts"

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

type ReadBlock =
  | z.output<typeof graphBlockSchema>
  | z.output<typeof mermaidBlockSchema>
  | z.output<typeof tableBlockSchema>
  | z.output<typeof codeBlockSchema>
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
      return readGraphSource(content).brokenLines.length > 0
        ? undefined
        : graphBlockSchema.safeParse({ kind: "graph", direction: "TD", source: content }).data
    case "mermaid":
      return content.trim() === ""
        ? undefined
        : mermaidBlockSchema.safeParse({ kind: "mermaid", source: content }).data
    case "table":
      return readTable(rest, content)
    case "code":
      return readCode(rest, content)
    case "callout":
      return content.trim() === ""
        ? undefined
        : noteBlockSchema.safeParse({ kind: "note", tone: rest.trim(), text: content.trim() }).data
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
    body.some((row) => row.length !== columns.length)
  ) {
    return undefined
  }
  return tableBlockSchema.safeParse({ kind: "table", title: title.trim(), columns, rows: body })
    .data
}

function tableCells(line: string): readonly string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function readCode(rest: string, content: string): ReadBlock | undefined {
  const [language, path] = rest.trim().split(/\s+/)
  return language === undefined || language === ""
    ? undefined
    : codeBlockSchema.safeParse({ kind: "code", language, path: path ?? "", source: content }).data
}

function readClaims(content: string): ReadBlock | undefined {
  const items = content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [certainty, claim, basis, howToVerify] = line.split("|").map((cell) => cell.trim())
      return { certainty, claim, basis: basis ?? "", howToVerify: howToVerify ?? "" }
    })
  return claimsBlockSchema.safeParse({ kind: "claims", items }).data
}

/** 中身の先頭の行が画像のパス、残りの行が notes。caption は info string の残り。 */
function readImage(caption: string, content: string): ReadBlock | undefined {
  const [path, ...notes] = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
  return path === undefined
    ? undefined
    : imageBlockSchema.safeParse({ kind: "image", path, caption: caption.trim(), notes }).data
}
