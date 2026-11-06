// 文字列を、HTML の本文にも属性値にも置ける形へエスケープする道具。

/** `& < > " '` を実体参照にする。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
