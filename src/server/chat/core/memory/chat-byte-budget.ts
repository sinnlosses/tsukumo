// 文面のバイト数の合計を上限まで1件単位で詰める。
// 入力は遅延の列で、上限を超える1件を見つけた時点で止めるので、その先の要素（ファイル）は引かれない。

/** 先頭の1件だけで上限を超えるときの扱い。`take` はその1件だけを載せ、`stop` は何も載せない。 */
export type FirstOversizedPolicy = "take" | "stop"

export type ByteBudgetOptions<T> = {
  readonly limitBytes: number
  readonly sizeOf: (item: T) => number
  readonly whenFirstExceeds: FirstOversizedPolicy
}

export type ByteBudgetResult<T> = {
  readonly taken: readonly T[]
  readonly usedBytes: number
  /** 上限を超える1件に当たって止まったか（列を使い切ったときは false）。 */
  readonly overflowed: boolean
}

export function takeWithinBytes<T>(
  items: Iterable<T>,
  options: ByteBudgetOptions<T>,
): ByteBudgetResult<T> {
  const taken: T[] = []
  let usedBytes = 0
  for (const item of items) {
    const bytes = options.sizeOf(item)
    if (usedBytes + bytes > options.limitBytes) {
      if (taken.length === 0 && options.whenFirstExceeds === "take") {
        taken.push(item)
        usedBytes += bytes
      }
      return { taken, usedBytes, overflowed: true }
    }
    taken.push(item)
    usedBytes += bytes
  }
  return { taken, usedBytes, overflowed: false }
}
