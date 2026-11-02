// あらすじの本文を、上限のバイト数に収まるよう行単位で切り詰める。

import { byteLength } from "../../../core/byte-length.ts"

/**
 * `limitBytes` に収まるよう、要約の本文を行単位で切り詰める。
 * 古いほうの行から落とし、行の途中では切らない。
 *
 * 本文の行は「新しい→古い」の順に積み、収まらなくなったところで古い行を落とす。
 * 要約の文面は「前の要約 + 新しい会話」を毎回まとめ直したものなので、末尾に近いほうが新しい話題という前提。
 *
 * 1行だけで上限を超えるとき（改行が無い）は、その1行をそのまま残す。
 * 空にする（＝要約ごと消える）よりも、上限を少し超えるほうを選ぶ。
 */
export function truncatedSummary(
  summary: string,
  limitBytes: number,
): {
  readonly text: string
  readonly droppedLines: number
} {
  const lines = summary.split("\n")
  const kept: string[] = []
  let usedBytes = 0
  for (const line of lines.toReversed()) {
    const separatorBytes = kept.length > 0 ? 1 : 0
    const lineBytes = byteLength(line) + separatorBytes
    if (kept.length > 0 && usedBytes + lineBytes > limitBytes) {
      break
    }
    kept.unshift(line)
    usedBytes += lineBytes
  }

  return { text: kept.join("\n"), droppedLines: lines.length - kept.length }
}
