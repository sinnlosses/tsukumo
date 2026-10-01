// セッションの要約（`report` の `sessionSummary`）を段落に割る。

/** 残っていることの段落の書き出し（`REPORT_SESSION_SUMMARY_DESCRIPTION` がこう書かせる）。 */
export const REMAINING_PREFIX = "残り"

/** 要約を段落に割る（空行でも改行1つでも段落の切れ目にする）。 */
export function summaryParagraphs(summary: string): readonly string[] {
  return summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

/** 「残り：」の段落の中身（書き出しの「残り：」は外す）。段落が無い・中身が空なら undefined。 */
export function remainingOf(summary: string): string | undefined {
  const paragraph = summaryParagraphs(summary).find((line) => line.startsWith(REMAINING_PREFIX))
  const rest = paragraph
    ?.slice(REMAINING_PREFIX.length)
    .replace(/^[:：]\s*/, "")
    .trim()
  return rest === undefined || rest === "" ? undefined : rest
}
