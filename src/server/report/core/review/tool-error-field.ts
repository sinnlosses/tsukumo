import { z } from "zod"

import type { ToolErrorField } from "../../../../shared/report/tool-error-field.ts"

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
  const list = issueListSchema.safeParse(issues)
  if (!list.success) {
    return []
  }
  const fields: ToolErrorField[] = []
  for (const issue of list.data) {
    const parsed = issueSchema.safeParse(issue)
    if (parsed.success) {
      const names = parsed.data.path.map((step) => (typeof step === "number" ? "n" : step))
      fields.push({ field: names.join("."), code: parsed.data.code })
    }
  }
  return fields.slice(0, MAX_TOOL_ERROR_FIELDS)
}

const issueListSchema = z.array(z.unknown())

const issueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string(),
})
