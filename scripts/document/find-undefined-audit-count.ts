// `undefined` の監査の文書の表の数（領域の表・理由の表・合計・本文の「全 N 件」）を、行から数え直して突き合わせる。
// 文書の数を直したあとに打つ。1件でも合わなければ終了コード1。

import process from "node:process"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  collectUndefinedAuditViolations,
  UNDEFINED_AUDIT_PATH,
} from "./lib/undefined-audit-repository.ts"
import { formatUndefinedAuditViolation } from "./undefined-audit-count.ts"

const violations = collectUndefinedAuditViolations(REPOSITORY_ROOT)
for (const violation of violations) {
  process.stdout.write(`${formatUndefinedAuditViolation(UNDEFINED_AUDIT_PATH, violation)}\n`)
}
process.stdout.write(`数の食い違い: ${violations.length}件\n`)
if (violations.length > 0) {
  process.exitCode = 1
}
