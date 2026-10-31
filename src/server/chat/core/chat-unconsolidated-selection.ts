// 読み込み済みの行から、定着の入力にする行を選ぶ。

import type { ChatArchiveLine } from "./chat-archive-port.ts"
import { isAfterAt, isBeforeAt } from "./chat-instant-order.ts"

/**
 * 載せる形に、索引と突き合わせるための時刻を添えたもの。
 * `at` は外へ出さない（読み戻しの1件が持つのは日付までで、時刻は渡さない）。
 */
export type TimedEntry = {
  readonly at: string
  readonly line: ChatArchiveLine
}

/**
 * 古い→新しいの順に並んだ `all` から、`afterAt` より後で、直近の窓の先頭（`windowStartAt`）より前にある行だけを集める。
 * `afterAt` が無ければ先頭から、`windowStartAt` が無ければ末尾まで。
 * 窓の先頭に届いたところで打ち切る。
 */
export function entriesUntilWindow(
  all: readonly TimedEntry[],
  afterAt: string | undefined,
  windowStartAt: string | undefined,
): readonly TimedEntry[] {
  const selected: TimedEntry[] = []
  for (const timed of all) {
    if (afterAt !== undefined && !isAfterAt(timed.at, afterAt)) {
      continue
    }
    if (windowStartAt !== undefined && !isBeforeAt(timed.at, windowStartAt)) {
      break
    }
    selected.push(timed)
  }
  return selected
}
