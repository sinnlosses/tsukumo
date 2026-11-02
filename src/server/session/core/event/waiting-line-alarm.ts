// 待ちの一言を出す時刻（`waitingLineDueAt`）に1回だけ鳴らす目覚まし。
// 時刻が来た瞬間には駆動から何も届かないので、サーバの時計で `waiting-line-due` を流すきっかけになる。

export type WaitingLineAlarm = {
  /**
   * 畳んだあとの姿の、待ちの一言を出す時刻を渡す。前と同じなら何もしない（鳴ったあとも鳴らし直さない）。
   * 変われば立て直し、undefined なら止める。過ぎた時刻ならすぐ鳴らす。
   */
  readonly set: (dueAt: number | undefined) => void
  readonly cancel: () => void
}

export function createWaitingLineAlarm(options: {
  readonly now: () => number
  readonly ring: () => void
}): WaitingLineAlarm {
  let armedDueAt: number | undefined = undefined
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  // タイマーは時計より少し早く発火することがあり、早いまま鳴らすと畳む側が「まだ出す時刻ではない」と見て積まない。
  // 発火したら時計を読み直し、届いていなければ残りの分だけ立て直す。
  const arm = (dueAt: number): void => {
    timer = setTimeout(
      () => {
        timer = undefined
        if (options.now() < dueAt) {
          arm(dueAt)
          return
        }
        options.ring()
      },
      Math.max(0, dueAt - options.now()),
    )
  }

  return {
    set: (dueAt) => {
      if (dueAt === armedDueAt) {
        return
      }
      clear()
      armedDueAt = dueAt
      if (dueAt !== undefined) {
        arm(dueAt)
      }
    },
    cancel: () => {
      clear()
      armedDueAt = undefined
    },
  }
}
