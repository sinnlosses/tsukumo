// アーカイブへの追記の順序。
// 画像を伴う依頼の行は原寸の書き出しが済むまで遅れるので、そのあいだに届いた行を後ろへ回して、届いた順に書く。

export type ChatArchiveOrder = {
  /**
   * 追記1件を、届いた順に走らせる。
   * 手前に未完の追記が無ければその場で同期に走らせる。
   * `task` は、書き終えるまでを表す Promise（同期で済むなら undefined）を返す。
   */
  readonly run: (task: () => Promise<void> | undefined) => void
}

export function createChatArchiveOrder(): ChatArchiveOrder {
  let pending: Promise<void> | undefined
  const run = (task: () => Promise<void> | undefined): void => {
    if (pending === undefined) {
      const started = task()
      if (started !== undefined) {
        pending = settle(started)
      }
      return
    }
    pending = settle(pending.then(task))
  }
  const settle = (task: Promise<void>): Promise<void> => {
    const done: Promise<void> = task.then(
      () => release(done),
      () => release(done),
    )
    return done
  }
  const release = (done: Promise<void>): void => {
    if (pending === done) {
      pending = undefined
    }
  }
  return { run }
}
