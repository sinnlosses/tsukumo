// ツール名＋入力を、画面に出してよい1行の要約にする。**許可要求（入力欄上の答え待ちの箱。
// `src/presentation/view.ts`）とサイドバーの「いま何をしているか」（`src/ui/sidebar/activity.tsx`）の
// 両方が読む契約**なので protocol に置く（同じ概念を2箇所で別に決めない。docs/design.md 2章）。
//
// **入力の全文は返さない**（docs/coding-standards.md「会話内容の扱い」）。純粋関数。

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
 */
export function summarizeToolInput(toolName: string, input: unknown): string {
  if (!isRecord(input)) {
    return ""
  }

  const field = TOOL_SUMMARY_FIELD_BY_TOOL[toolName]
  const value = field === undefined ? firstStringValue(input) : stringField(input, field)
  return value === undefined ? "" : truncateToolSummary(value)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
