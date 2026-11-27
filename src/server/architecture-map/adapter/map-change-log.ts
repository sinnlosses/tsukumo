// 直近の commit の読みを、地図の `source.commit` ごとに1回だけ打つ。

/** 直前と同じ `sourceCommit` なら覚えた結果（読み中の Promise も）を返す。`uncounted`（読めなかった）は覚えない。 */
export function rememberBySourceCommit<T extends { readonly kind: string }>(
  read: () => Promise<T>,
): (sourceCommit: string) => Promise<T> {
  // 覚えるのは直前の1件だけ
  const remembered = new Map<string, Promise<T>>()
  return async (sourceCommit) => {
    const earlier = remembered.get(sourceCommit)
    if (earlier !== undefined) {
      return earlier
    }
    const result = read()
    remembered.clear()
    remembered.set(sourceCommit, result)
    const value = await result
    if (value.kind === "uncounted" && remembered.get(sourceCommit) === result) {
      remembered.delete(sourceCommit)
    }
    return value
  }
}
