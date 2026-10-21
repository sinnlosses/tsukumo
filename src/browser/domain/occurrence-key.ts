export type KeyedItem<T> = {
  readonly key: string
  readonly item: T
  readonly index: number
}

/**
 * 並びの各要素に、中身と「同じ中身の何番目か」でできた key を付ける。
 * 見分ける id の無い並び（文字列の並びなど）で、同じ中身が2つあっても key が重ならない。
 */
export function withOccurrenceKeys<T>(
  items: readonly T[],
  toText: (item: T) => string,
): readonly KeyedItem<T>[] {
  const seen = new Map<string, number>()
  return items.map((item, index) => {
    const text = toText(item)
    const count = seen.get(text) ?? 0
    seen.set(text, count + 1)
    return { key: `${text}#${count}`, item, index }
  })
}
