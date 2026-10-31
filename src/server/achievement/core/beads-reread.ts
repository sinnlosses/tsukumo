// 成果の Beads の読みを、前回の読みを使い回すか読み直すか決める。

/** 前回読み始めた課題の印と、その時刻（ミリ秒）。 */
export type LastBeadsRead = { readonly stamp: string; readonly at: number }

/**
 * - `reuse`: `last`（前回の読み）を使い回す
 * - `reread`: 読み直す。`readStamp` は `bd list` へ渡す印で、読み直しの回は印を渡さない（印ごとに覚えた結果を使い回させない）
 */
export type BeadsRereadDecision<Last extends LastBeadsRead> =
  | { readonly kind: "reuse"; readonly last: Last }
  | { readonly kind: "reread"; readonly readStamp: string | undefined }

/** `isWithinInterval` は、前回から経った時間が読み直しの間隔内かを答える。 */
export function reuseOrReread<Last extends LastBeadsRead>(
  last: Last | undefined,
  stamp: string | undefined,
  now: number,
  isWithinInterval: (elapsedMs: number) => boolean,
): BeadsRereadDecision<Last> {
  const rereadDue = last !== undefined && !isWithinInterval(now - last.at)
  if (last !== undefined && stamp !== undefined && last.stamp === stamp && !rereadDue) {
    return { kind: "reuse", last }
  }
  return { kind: "reread", readStamp: rereadDue ? undefined : stamp }
}
