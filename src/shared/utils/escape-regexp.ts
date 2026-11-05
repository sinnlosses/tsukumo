// 文字列を、正規表現の中で文字どおりに当たる形へエスケープする道具。

/** 正規表現のメタ文字を `\` で打ち消す。 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
