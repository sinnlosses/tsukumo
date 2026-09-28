// 雑談のログで、届いた記録を画面へ出すタイミングを決める。
//
// セリフは `speech` イベントで1件まるごと届く（`speak` の戻りが `"ok"` になる時点で全文がある）ので、出すタイミングだけをブラウザ側で持たせる。
// キャラクターの吹き出しどうしを最低2秒空けて出す（続けて出るとびっくりするため）。
//
// 待たせるのは前置きを絞る形（`entries` の先頭から出せるところまで）。
// 利用者の発言・日の区切り・圧縮の区切りは、順番が回ってくればその場で出す。
// 返事を待っている間は雑談中の入力欄が塞がるので、待っている吹き出しの手前に利用者の発言が割り込むことは無い。
//
// 出せるところまでは effect ではなくレンダー中に進める。
// `entries` が増えたときも、時計が2秒の間隔に追いついたときも、判定は純粋関数 `advanceReveal` のやり直しで済む。
// effect が持つのはタイマー1つだけで、役目は「空いたかもしれない頃合いに描き直させる」合図を出すことだけ。

import { useEffect, useState } from "react"

import type { ChatLogEntry } from "../../../../../../../shared/chat/chat-log.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"

/** キャラクターの吹き出しどうしを最低これだけ空ける（ms）。 */
const MIN_GAP_MS = 2000

/** 空くのを待っている間、描き直す頻度（ms）。実際に空いたかは描き直すたびに見直す。 */
const POLL_INTERVAL_MS = 50

export type RevealedChatLog = {
  /** いま出してよい記録（`entries` の先頭からの一部）。 */
  readonly entries: readonly ChatLogEntry[]
  /** まだ出していない記録が控えている（`showTyping` の条件に足す）。 */
  readonly pending: boolean
}

/**
 * `entries` のうち、いま画面へ出してよい前置きを返す。
 * 画面を開いた時点で並んでいた記録は待たせず全部出す（前の雑談の続きが、開くたびに端から出し直されることにならないように）。
 *
 * それより後に届いた記録は、キャラクターのセリフの番が回ってくるたびに、前の吹き出しを出してから {@link MIN_GAP_MS} 空くまで足止めする。
 * 利用者の発言・区切りは待たせない。
 */
export function useRevealedChatLog(entries: readonly ChatLogEntry[]): RevealedChatLog {
  const [revealedCount, setRevealedCount] = useState(entries.length)
  // 直前に吹き出しを出した時刻。マウント時点で並んでいた記録ぶんはここに残さない（undefined のまま）。
  // そのときは根拠なく足止めせず、最初の1件は届き次第そのまま出す。
  const [lastRevealAt, setLastRevealAt] = useState<number | undefined>(undefined)
  // 空くのを待っている間だけ描き直すための、使い捨ての合図（値そのものに意味は無い）。
  const [, forcePoll] = useState(0)

  // 出せるところまでをレンダー中に進める（いまの時刻を読むのはここだけ）。
  // React はレンダー中の `setState` を、コミットする前にもう一度その場でレンダーし直すので、この回のうちに反映される。
  const advanced = advanceReveal(entries, revealedCount, lastRevealAt, nowEpochMilliseconds())
  if (advanced.count !== revealedCount) {
    setRevealedCount(advanced.count)
  }
  if (advanced.lastRevealAt !== lastRevealAt) {
    setLastRevealAt(advanced.lastRevealAt)
  }

  // 足止めしている間だけ、空いたかもしれない頃合いに描き直させる。
  // 空いたかどうかの判定自体は上のレンダー中の計算がやり直すので、ここで呼ぶ `setState` は「もう一度描き直して」という合図でしかなく、`entries` や `revealedCount` を直接進めない。
  useEffect(() => {
    if (advanced.count >= entries.length) {
      return undefined
    }
    const timer = setInterval(() => {
      forcePoll((count) => count + 1)
    }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [advanced.count, entries])

  return { entries: entries.slice(0, advanced.count), pending: advanced.count < entries.length }
}

/** {@link advanceReveal} の結果。 */
type Advanced = {
  readonly count: number
  readonly lastRevealAt: number | undefined
}

/**
 * `revealedCount` から先へ、いま出せるところまで進める。
 * キャラクターのセリフだけ {@link MIN_GAP_MS} のゲートを見て、利用者の発言・日の区切り・圧縮の区切りは順番が回ってくればそのまま通す。
 * ゲートに引っかかったら、そこで止まって残りは次の機会に譲る。
 */
function advanceReveal(
  entries: readonly ChatLogEntry[],
  revealedCount: number,
  lastRevealAt: number | undefined,
  now: number,
): Advanced {
  let count = revealedCount
  let revealAt = lastRevealAt
  while (count < entries.length) {
    const next = entries[count]
    if (next === undefined) {
      break
    }
    if (next.speaker === "character") {
      if (revealAt !== undefined && now - revealAt < MIN_GAP_MS) {
        break
      }
      revealAt = now
    }
    count += 1
  }
  return { count, lastRevealAt: revealAt }
}
