// ツール名＋入力を、画面に出してよい1行の要約にする。
//
// 入力の全文は返さない（docs/coding-standards.md「会話内容の扱い」）。純粋関数。

import { isPlainObject } from "remeda"

import { optionalString } from "../../shared/utils/optional-string.ts"

/** ツール入力の要約に出す1行の長さの上限（目安）。 */
const MAX_TOOL_SUMMARY_LENGTH = 120

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

/**
 * ツール名＋入力を、画面に出してよい1行の要約にする。入力がオブジェクトの形でないときは空文字。
 * 切り詰めるだけ（どの欄を読むかは {@link toolInputText} の1箇所で決める。
 * docs/screen-design.md 13.9「いまの作業」）。
 */
export function summarizeToolInput(toolName: string, input: unknown): string {
  return truncateToolSummary(toolInputText(toolName, input))
}

/**
 * ツール名＋入力から、要約と同じ欄（Bash は `command`、Edit / Write / Read は `file_path`）の値を
 * 切り詰めずに返す。帯の「いまの作業」が開く一覧の「実行中の手順の全文」に使う
 * （docs/screen-design.md 13.9）。入力がオブジェクトの形でない・欄が見つからないときは空文字。
 */
export function toolInputText(toolName: string, input: unknown): string {
  if (!isPlainObject(input)) {
    return ""
  }

  const field = TOOL_SUMMARY_FIELD_BY_TOOL[toolName]
  const value = field === undefined ? firstStringValue(input) : stringField(input, field)
  return value ?? ""
}

function firstStringValue(input: Readonly<Record<string, unknown>>): string | undefined {
  for (const value of Object.values(input)) {
    if (typeof value === "string") {
      return value
    }
  }
  return undefined
}

function stringField(input: Readonly<Record<string, unknown>>, field: string): string | undefined {
  return optionalString(input[field])
}

function truncateToolSummary(text: string): string {
  return text.length <= MAX_TOOL_SUMMARY_LENGTH
    ? text
    : `${text.slice(0, MAX_TOOL_SUMMARY_LENGTH)}…`
}
