// 指定のミリ秒だけ待つ道具。

/** `ms` ミリ秒たったら解決する。 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
