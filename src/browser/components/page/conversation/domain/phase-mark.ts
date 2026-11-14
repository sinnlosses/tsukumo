// 済んだ段の印。済んだ段は「✓」、飛ばした段は「/」。

const CHECK_MARK = "✓"
const SKIPPED_MARK = "/"

export function doneMarkOf(skipped: boolean): string {
  return skipped ? SKIPPED_MARK : CHECK_MARK
}
