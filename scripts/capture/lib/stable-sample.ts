// 間をおいて撮った見本が、連続2回で一致するまで待つ（静止の判定）。

/**
 * `sample` を `intervalMs` おきに最大 `attempts` 回呼び、連続2回の結果が一致したら true、
 * 一致しないまま回数が尽きたら false を返す。
 */
export async function waitUntilStable(
  sample: () => Promise<Buffer>,
  options: { readonly intervalMs: number; readonly attempts: number },
): Promise<boolean> {
  let previous: Buffer | undefined
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const current = await sample()
    if (previous?.equals(current) === true) {
      return true
    }
    previous = current
    await new Promise<void>((resolve) => {
      setTimeout(resolve, options.intervalMs)
    })
  }
  return false
}
