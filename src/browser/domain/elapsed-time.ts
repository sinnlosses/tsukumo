// 経過秒を読む文字列にする。ターンの経過（`dispatch/hooks/use-turn-status.ts`）と見直し中の経過
// （`token-usage/hooks/use-usage-review.ts`）の2つの機能が同じ書き方を読むので
// `browser/domain/`（CLAUDE.md 原則5）。

/** 秒数を表示用の文字列にする（60秒未満は `N秒`、以降は `M分SS秒`）。 */
export function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}秒`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}分${String(seconds).padStart(2, "0")}秒`
}
