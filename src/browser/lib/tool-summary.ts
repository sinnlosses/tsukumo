// ツール名＋入力を、画面に出してよい1行の要約にする。**帯の「いまの作業」
// （`src/browser/features/screen-nav/`）と入力欄の答え待ちの箱
// （`src/browser/features/dispatch/pending-answer.tsx`）の両方が読む**ので、機能をまたぐ道具として
// `browser/lib/` に置く（docs/design.md 2章「`src/browser/` の箱と、置く基準」）。
//
// **段3では `shared` に置いていた**（旧の答え待ちの箱 `presentation/view.ts` と新しい
// `browser/sidebar/activity.tsx` の両方が読むのに、`browser → presentation` も `presentation → browser` も
// 禁じられていて、共有できる場所が `shared` しか無かったため）。**段4で答え待ちの箱が
// `browser/` に来て旧側の読み手が消えた**ので、ここへ移した。表示の整形であってサーバとブラウザの
// 契約ではないので、`shared` に置いたままにしない（`shared` が何でも入る置き場になるのを
// 防ぐ。docs/design.md 2章）。
//
// **入力の全文は返さない**（docs/coding-standards.md「会話内容の扱い」）。純粋関数。

import { isPlainObject } from "remeda"

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
 * **切り詰めるだけ**（どの欄を読むかは {@link toolInputText} の1箇所で決める。
 * docs/design.md 13.9「いまの作業」）。
 */
export function summarizeToolInput(toolName: string, input: unknown): string {
  return truncateToolSummary(toolInputText(toolName, input))
}

/**
 * ツール名＋入力から、要約と同じ欄（Bash は `command`、Edit / Write / Read は `file_path`）の値を
 * **切り詰めずに**返す。帯の「いまの作業」が開く一覧の「実行中の手順の全文」に使う
 * （docs/design.md 13.9）。入力がオブジェクトの形でない・欄が見つからないときは空文字。
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
  const value = input[field]
  return typeof value === "string" ? value : undefined
}

function truncateToolSummary(text: string): string {
  return text.length <= MAX_TOOL_SUMMARY_LENGTH
    ? text
    : `${text.slice(0, MAX_TOOL_SUMMARY_LENGTH)}…`
}
