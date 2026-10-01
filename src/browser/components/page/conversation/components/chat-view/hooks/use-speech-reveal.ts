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
// effect が持つのは、足止めが空く時刻に1回だけ鳴るタイマーで、役目は描き直させる合図を出すことだけ。

import { useEffect, useState } from "react"
import { isDeepEqual } from "remeda"

import type { ChatLogEntry } from "../../../../../../../shared/chat/chat-log.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"

/** キャラクターの吹き出しどうしを最低これだけ空ける（ms）。 */
const MIN_GAP_MS = 2000

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
  // 出してよい前置き。中身が変わらないあいだは同じ配列を持ち続け、受け取る側の導出を無駄に走らせない。
  const [shown, setShown] = useState(entries)
  // 直前に吹き出しを出した時刻。マウント時点で並んでいた記録ぶんはここに残さない（undefined のまま）。
  // そのときは根拠なく足止めせず、最初の1件は届き次第そのまま出す。
  const [lastRevealAt, setLastRevealAt] = useState<number | undefined>(undefined)
  // 足止めが空いて描き直させたときの時刻。
  // 時刻の読み取りは引数の無い呼び出しで、React Compiler は依存に数えない。
  // この値を渡して、描き直しのたびに時刻を読み直させる。
  const [wokeAt, setWokeAt] = useState(0)

  // 出せるところまでをレンダー中に進める（いまの時刻を読むのはここだけ）。
  // React はレンダー中の `setState` を、コミットする前にもう一度その場でレンダーし直すので、この回のうちに反映される。
  const advanced = advanceReveal(
    entries,
    shown.length,
    lastRevealAt,
    Math.max(wokeAt, nowEpochMilliseconds()),
  )
  const prefix = entries.slice(0, advanced.count)
  if (!isDeepEqual(shown, prefix)) {
    setShown(prefix)
  }
  if (advanced.lastRevealAt !== lastRevealAt) {
    setLastRevealAt(advanced.lastRevealAt)
  }

  // 足止めしている間だけ、空く時刻に1回だけ描き直させる。
  // 空いたかどうかの判定自体は上のレンダー中の計算がやり直すので、ここで呼ぶ `setState` は「もう一度描き直して」という合図でしかなく、`entries` や出す件数を直接進めない。
  useEffect(() => {
    if (advanced.kind === "open") {
      return undefined
    }
    const { openAt } = advanced
    let timer = setTimeout(wake, openAt - nowEpochMilliseconds())
    // タイマーが時計より早く鳴ったときは、残りでもう一度張る。
    function wake(): void {
      const remaining = openAt - nowEpochMilliseconds()
      if (remaining > 0) {
        timer = setTimeout(wake, remaining)
        return
      }
      setWokeAt(openAt)
    }
    return () => {
      clearTimeout(timer)
    }
  }, [advanced])

  return { entries: shown, pending: advanced.count < entries.length }
}

/** {@link advanceReveal} の結果。`gated` は次のセリフが `openAt`（エポックミリ秒）まで足止めされている。 */
type Advanced =
  | { readonly kind: "open"; readonly count: number; readonly lastRevealAt: number | undefined }
  | {
      readonly kind: "gated"
      readonly count: number
      readonly lastRevealAt: number
      readonly openAt: number
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
        return { kind: "gated", count, lastRevealAt: revealAt, openAt: revealAt + MIN_GAP_MS }
      }
      revealAt = now
    }
    count += 1
  }
  return { kind: "open", count, lastRevealAt: revealAt }
}
