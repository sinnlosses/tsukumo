// 雑談のログのスクロール位置の同期。
// 下端付近を読んでいたときだけ新しい1件で最新へ寄せる（読み返している最中は動かさない）。
// `column-reverse` を使わないのは、この並びが「最新だけを読む」吹き出しではなく遡って読み返せるログだから。

// oxlint-disable-next-line no-restricted-imports -- exhaustive-deps が依存配列の値の再生成で落ちるため残す（docs/coding-standards/react.md「手でメモ化しない」）
import { useCallback, useRef, type RefCallback } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"

/**
 * 「下端付近」とみなす、下端からの残り距離（px）。
 * 0 にすると、フォントの読み込みや小数点の丸めで scrollHeight がわずかにぶれただけで「読み返し中」と誤判定してしまう。
 * 発言1件分の高さ（`.chat-entry` の padding・line-height から見て 60〜90px 程度）より少し広めに取る。
 */
const NEAR_BOTTOM_THRESHOLD_PX = 120

/**
 * 返した ref コールバックをログの入れ物（スクロールする要素）に付ける。
 * `count` は並んでいる行の件数で、増えたときに寄せる合図になる。
 */
export function useStickToBottom(count: number): RefCallback<HTMLDivElement> {
  const logRef = useRef<HTMLDivElement>(null)
  // 利用者が下端付近を読んでいるかどうか。
  // 新着が来た「あと」に測ったのでは元の位置がわからないので、スクロール操作のたびに更新しておく。
  // 初期値は true（まだ何も積まれていない・積まれたばかりの状態は下端に等しい）。
  const nearBottomRef = useRef(true)

  // 下端付近を読んでいたときだけ最新へ寄せる（読み返している最中に下へ攫わない）。
  // 件数が増えたときと、件数が変わらないまま中身だけ動いたときの2つが、どちらもこの規則に従う。
  //
  // `useCallback` を残す例外（docs/coding-standards.md「手でメモ化しない」）。
  // oxlint の `react-hooks(exhaustive-deps)` は依存配列の関数が毎回作り直されるかを静的に見るだけで、Compiler が実行時にメモ化することは検査に映らないので、外すと lint が落ちる。
  const stickToBottom = useCallback((): void => {
    const log = logRef.current
    if (log === null || !nearBottomRef.current) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [])

  useExternalSync(() => {
    if (count === 0) {
      return
    }
    stickToBottom()
  }, [count, stickToBottom])

  // 入れ物が付いたときに、読んでいる位置の追跡と DOM の並びの変化の購読を始め、外れるときに切る。
  // 位置は「件数が増えたら寄せる」effect より前からずっと追い続ける必要があるので、件数の変化とは別に張る。
  //
  // 「...」は `count` に数えない行なので、現れて消えるたびに末尾の高さが動くのを、並びの購読で拾う。
  // 見るのは子要素の増減だけなので、押して印が移ったとき（class と `aria-pressed` が変わるだけ）には動かない。
  return (log: HTMLDivElement | null) => {
    if (log === null) {
      return undefined
    }
    logRef.current = log
    const updateNearBottom = (): void => {
      const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight
      nearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX
    }
    log.addEventListener("scroll", updateNearBottom)
    const observer = new MutationObserver(stickToBottom)
    observer.observe(log, { subtree: true, childList: true })
    return () => {
      log.removeEventListener("scroll", updateNearBottom)
      observer.disconnect()
      logRef.current = null
    }
  }
}
