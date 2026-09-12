// 呼び出しをまとめて間引く。押し出しの間引きは「決める」側の都合（配りすぎない）で、
// `setTimeout` は使うが外の世界（fs・プロセス・SDK）には触らない。

/**
 * 呼び出しをまとめる。**最後の1回は必ず配る**（間隔の終わりに、そのとき最新の値を渡す）ので、
 * 流れが止まったあとに古い状態が残ることがない。
 */
export function throttle<T>(publish: (value: T) => void, intervalMs: number): (value: T) => void {
  let latest: T | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  return (value) => {
    latest = value
    if (timer !== undefined) {
      return
    }

    timer = setTimeout(() => {
      timer = undefined
      const pending = latest
      latest = undefined
      if (pending !== undefined) {
        publish(pending)
      }
    }, intervalMs)
  }
}
