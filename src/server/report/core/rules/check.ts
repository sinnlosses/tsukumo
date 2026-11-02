// `checks` の欄の検査の家族。違反の型・検出・差し戻し文を持つ。

import type { ReportDraft } from "./draft.ts"

export type CheckViolation =
  /** `checks` の `unobserved` の行の `howToVerify` が空（空白だけを含む）。`count` は該当の行の数。 */
  { readonly kind: "unobserved-without-how"; readonly count: number }

/** `checks` の違反を、当てはまらないもの（`count` が 0）も含めて並べる。 */
export function detectCheckViolations(
  report: Pick<ReportDraft, "checks">,
): readonly CheckViolation[] {
  return [
    {
      kind: "unobserved-without-how",
      count: report.checks.filter(
        (check) => check.status === "unobserved" && check.howToVerify.trim() === "",
      ).length,
    },
  ]
}

export function isCheckViolation(violation: {
  readonly kind: string
}): violation is CheckViolation {
  return violation.kind === "unobserved-without-how"
}

/** `checks` の違反を、差し戻すときの1行の文面にする。 */
export function checkViolationMessage(violation: CheckViolation): string {
  return `\`checks\` の \`unobserved\` の行のうち \`howToVerify\` が空のものが${violation.count}個ある。知らない人が繰り返せる確かめ方を1〜2文で書く`
}
