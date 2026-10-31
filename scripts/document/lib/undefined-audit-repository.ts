// `undefined` の監査の文書を読んで、数の食い違いを集める、という概念1つを持つ。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  findUndefinedAuditViolations,
  type UndefinedAuditViolation,
} from "../undefined-audit-count.ts"

export const UNDEFINED_AUDIT_PATH = "docs/research/undefined-audit-2026-10-29.md"

export function collectUndefinedAuditViolations(
  root: string,
  path: string = UNDEFINED_AUDIT_PATH,
): readonly UndefinedAuditViolation[] {
  return findUndefinedAuditViolations(readFileSync(join(root, path), "utf8"))
}
