// ツール入力のうち、画面の要約に使う1つの欄を選ぶ。

import { isPlainObject } from "remeda"

/**
 * ツール入力の要約に使うフィールド名。Bash は `command`、Edit / Write / Read は `file_path`。
 * 載っていないツールは最初に見つかった文字列値に落ちる。
 */
const TOOL_SUMMARY_FIELD_BY_TOOL: Readonly<Record<string, string>> = {
  Bash: "command",
  Edit: "file_path",
  Write: "file_path",
  Read: "file_path",
}

/** 要約に使う欄の名前と値。 */
export type ToolSummaryField = { readonly field: string; readonly value: string }

/**
 * ツール名＋入力から、要約に使う欄の名前と値を返す。
 * 入力がオブジェクトの形でない・欄が文字列でないときは undefined。
 */
export function toolSummaryField(toolName: string, input: unknown): ToolSummaryField | undefined {
  if (!isPlainObject(input)) {
    return undefined
  }
  const field = TOOL_SUMMARY_FIELD_BY_TOOL[toolName]
  if (field !== undefined) {
    const value = input[field]
    return typeof value === "string" ? { field, value } : undefined
  }
  const first = Object.entries(input).find(([, value]) => typeof value === "string")
  return first === undefined || typeof first[1] !== "string"
    ? undefined
    : { field: first[0], value: first[1] }
}

/**
 * ツール入力を、要約に使う欄1つだけの入力に絞る（欄が無ければ空のオブジェクト）。
 * 絞った入力を要約しても、元の入力の要約と同じ字になる。
 */
export function toolSummaryInput(
  toolName: string,
  input: unknown,
): Readonly<Record<string, string>> {
  const picked = toolSummaryField(toolName, input)
  return picked === undefined ? {} : { [picked.field]: picked.value }
}
