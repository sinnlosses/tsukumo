// 間をおいて撮った見本が、連続2回で一致するまで待つ（静止の判定）。

export type StableOutcome =
  | { readonly stable: true }
  | {
      readonly stable: false
      readonly before?: Buffer
      readonly last?: Buffer
    }

/**
 * `sample` を `intervalMs` おきに最大 `attempts` 回呼び、連続2回の結果が一致したら stable、
 * 一致しないまま回数が尽きたら最後の2回の結果を添えて not stable を返す。
 */
export async function waitUntilStable(
  sample: () => Promise<Buffer>,
  options: { readonly intervalMs: number; readonly attempts: number },
): Promise<StableOutcome> {
  let before: Buffer | undefined
  let last: Buffer | undefined
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    const current = await sample()
    if (last?.equals(current) === true) {
      return { stable: true }
    }
    before = last
    last = current
    await new Promise<void>((resolve) => {
      setTimeout(resolve, options.intervalMs)
    })
  }
  return { stable: false, before, last }
}
