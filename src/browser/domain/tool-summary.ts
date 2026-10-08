// ツール名＋入力を、画面に出してよい1行の要約にする。入力の全文は返さない。

import { isPlainObject } from "remeda"

import { clipText } from "../../shared/utils/clip-text.ts"
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
 * 改行を空白に畳んで切り詰めるだけで、どの欄を読むかは {@link toolInputText} の1箇所で決める。
 * 要約は空白を保って組まれることもあるので、改行を残すと1行に収まらない。
 */
export function summarizeToolInput(toolName: string, input: unknown): string {
  return truncateToolSummary(toolInputText(toolName, input).replaceAll(/\s*[\r\n]+\s*/g, " "))
}

/**
 * ツール名＋入力から、要約と同じ欄の値を切り詰めずに返す（帯の「いまの作業」の一覧の「実行中の手順の全文」に使う）。
 * 入力がオブジェクトの形でない・欄が見つからないときは空文字。
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
  const { head, omittedLength } = clipText(text, MAX_TOOL_SUMMARY_LENGTH)
  return omittedLength > 0 ? `${head}…` : head
}
