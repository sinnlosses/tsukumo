// ツール名＋入力を、画面に出してよい1行の要約にする。入力の全文は返さない。

import { clipWithEllipsis } from "../../shared/utils/clip-text.ts"
import { toolSummaryField } from "../../shared/utils/tool-summary-field.ts"

/** ツール入力の要約に出す1行の長さの上限（目安）。 */
const MAX_TOOL_SUMMARY_LENGTH = 120

/**
 * ツール名＋入力を、画面に出してよい1行の要約にする。入力がオブジェクトの形でないときは空文字。
 * 改行を空白に畳んで切り詰めるだけで、どの欄を読むかは {@link toolInputText} の1箇所で決める。
 * 要約は空白を保って組まれることもあるので、改行を残すと1行に収まらない。
 */
export function summarizeToolInput(toolName: string, input: unknown): string {
  return clipWithEllipsis(
    toolInputText(toolName, input).replaceAll(/\s*[\r\n]+\s*/g, " "),
    MAX_TOOL_SUMMARY_LENGTH,
  )
}

/**
 * ツール名＋入力から、要約と同じ欄の値を切り詰めずに返す（帯の「いまの作業」の一覧の「実行中の手順の全文」に使う）。
 * 入力がオブジェクトの形でない・欄が見つからないときは空文字。
 */
export function toolInputText(toolName: string, input: unknown): string {
  return toolSummaryField(toolName, input)?.value ?? ""
}
