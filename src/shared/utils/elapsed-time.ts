// 測った経過時間の形と、経過秒を読む文字列にする書式。

/** 測った経過時間。測れなかったときは `unknown`。 */
export type MeasuredTime =
  | { readonly kind: "known"; readonly milliseconds: number }
  | { readonly kind: "unknown" }

/** 秒数を表示用の文字列にする（60秒未満は `N秒`、以降は `M分SS秒`）。 */
export function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}秒`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}分${String(seconds).padStart(2, "0")}秒`
}
