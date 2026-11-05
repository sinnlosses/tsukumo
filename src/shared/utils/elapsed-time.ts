// 測った経過時間の形と、経過秒を読む文字列にする書式。

/** 測った経過時間。測れなかったときは `unknown`。 */
export type MeasuredTime =
  | { readonly kind: "known"; readonly milliseconds: number }
  | { readonly kind: "unknown" }

/** 測った経過時間を表示用の文字列にする。測れなかったら「不明」。 */
export function formatMeasured(time: MeasuredTime): string {
  return time.kind === "known" ? formatElapsed(Math.round(time.milliseconds / 1000)) : "不明"
}

/** 秒数を「M:SS」の形にする（分は 60 を超えても繰り上げない）。秒への丸めは呼ぶ側が持つ。 */
export function formatMinutesSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  return `${String(minutes)}:${String(totalSeconds % 60).padStart(2, "0")}`
}

/** 秒数を表示用の文字列にする（60秒未満は `N秒`、以降は `M分SS秒`）。 */
export function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}秒`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}分${String(seconds).padStart(2, "0")}秒`
}
