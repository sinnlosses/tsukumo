// mermaid.parse が投げたエラーから、割れた位置を取り出す。

import { z } from "zod"

import type { MermaidFault } from "../core/report-figure-fault.ts"

const LINE_PATTERN = /Parse error on line (\d+)/
const TOKEN_PATTERN = /got '([A-Z_]+)'/

// jison の構文解析器が付ける欄。
const hashSchema = z.object({
  hash: z.object({ loc: z.object({ last_line: z.number().int() }), token: z.string() }),
})

/**
 * 構造の欄 `hash` から行と字句を取る。欄が無いときだけ、エラー文の正規表現に戻る。
 * 行は `hash.loc.last_line`。エラー文の行と、sequence・flowchart・class・state・er のどれでも一致する
 * （`hash.line` は図の種類によって1小さい）。
 */
export function faultOfParseError(block: number, error: unknown): MermaidFault {
  const structured = hashSchema.safeParse(error)
  if (structured.success) {
    const { loc, token } = structured.data.hash
    return { kind: "located", block, line: loc.last_line, token }
  }
  const text = messageOf(error)
  const line = LINE_PATTERN.exec(text)?.[1]
  return line === undefined
    ? { kind: "unlocated", block }
    : { kind: "located", block, line: Number(line), token: TOKEN_PATTERN.exec(text)?.[1] ?? "" }
}

function messageOf(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "str" in error &&
    typeof error.str === "string"
  ) {
    return error.str
  }
  return error instanceof Error ? error.message : ""
}
