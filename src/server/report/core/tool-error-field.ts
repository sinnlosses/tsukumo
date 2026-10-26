import type { ToolErrorField } from "../../../shared/report/tool-error-field.ts"

/** 欄名の数の上限。深い union が 1 回で何十も落ちても記録が膨らまない。 */
const MAX_TOOL_ERROR_FIELDS = 20

/**
 * 形の検査で落ちた `report` の結果の本文から、zod の `issues` の欄名と `code` だけを取る。
 * 本文は `Input validation error: Invalid arguments for tool …: [ …issues の JSON… ]` の形で、
 * 欄を欠いたときの本文のように JSON を持たない本文は空の並びを返す。
 * `message` と値は読まず、入れ子の `errors` の中も見ない。
 */
export function toolErrorFieldsOf(content: string): readonly ToolErrorField[] {
  const start = content.indexOf("[")
  if (start === -1) {
    return []
  }
  const end = content.lastIndexOf("]")
  if (end < start) {
    return []
  }
  let issues: unknown
  try {
    issues = JSON.parse(content.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(issues)) {
    return []
  }
  const fields: ToolErrorField[] = []
  for (const issue of issues as readonly unknown[]) {
    const field = fieldOf(issue)
    if (field !== undefined) {
      fields.push(field)
    }
  }
  return fields.slice(0, MAX_TOOL_ERROR_FIELDS)
}

function fieldOf(issue: unknown): ToolErrorField | undefined {
  if (typeof issue !== "object" || issue === null) {
    return undefined
  }
  const { path, code } = issue as Readonly<Record<string, unknown>>
  if (!Array.isArray(path) || typeof code !== "string") {
    return undefined
  }
  const names = (path as readonly unknown[]).map((step) =>
    typeof step === "number" ? "n" : typeof step === "string" ? step : undefined,
  )
  if (names.includes(undefined)) {
    return undefined
  }
  return { field: names.join("."), code }
}
