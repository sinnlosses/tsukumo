/**
 * `writtenAt`（オフセット付き ISO）から「21:40」を切り出す。
 * ローカル時刻を文字のまま持つので `Temporal` へ通さない。
 */
export function writtenTimeOf(writtenAt: string): string | undefined {
  return /T(\d{2}:\d{2})/.exec(writtenAt)?.[1]
}
