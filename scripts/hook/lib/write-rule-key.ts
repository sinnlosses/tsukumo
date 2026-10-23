/** パスが作業ツリーのどちら側にあるか。`unknown` は展開や読めない `cd` で決まらないもの。 */
export type Location = "inside" | "outside" | "unknown"

/**
 * 書き先のどれかが作業ツリーの外でなければ規則のキー。
 * 中と決まる書き先が無く、決まらないだけのときは `-unresolved` を付ける。
 */
export function writeRuleFor(rule: string, destinations: readonly Location[]): string | undefined {
  if (destinations.every((location) => location === "outside")) {
    return undefined
  }
  return destinations.includes("inside") ? rule : `${rule}-unresolved`
}
