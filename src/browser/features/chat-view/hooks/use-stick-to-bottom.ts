// 雑談のログのスクロール位置の同期。**古い→新しいの順にそのまま積み**、下端付近を読んでいた
// ときだけ新しい1件で最新へ寄せる（読み返している最中は動かさない。docs/screen-design.md 13.7）。
// `column-reverse` を使わないのは、この並びが「最新だけを読む」吹き出しではなく**遡って読み返せる
// ログ**だから。

import { useCallback, useEffect, useRef, type RefObject } from "react"

/**
 * 「下端付近」とみなす、下端からの残り距離（px）。0 にすると、フォントの読み込みや
 * 小数点の丸めで scrollHeight がわずかにぶれただけで「読み返し中」と誤判定してしまうので、
 * 発言1件分の高さ（`.chat-entry` の padding・line-height から見て 60〜90px 程度）より
 * 少し広めに取る。
 */
const NEAR_BOTTOM_THRESHOLD_PX = 120

/**
 * 返した ref をログの入れ物（スクロールする要素）に付ける。`count` は並んでいる行の件数で、
 * 増えたときに寄せる合図になる。
 */
export function useStickToBottom(count: number): RefObject<HTMLDivElement | null> {
  const logRef = useRef<HTMLDivElement>(null)
  // 利用者が下端付近を読んでいるかどうか。新着が来た「あと」に測ったのでは元の位置が
  // わからないので、スクロール操作のたびに更新しておく（初期値は true — まだ何も
  // 積まれていない・積まれたばかりの状態は下端に等しい）。
  const nearBottomRef = useRef(true)

  // 外部システム（スクロール操作）の購読。利用者がどこを読んでいるかを、下の
  // 「件数が増えたら寄せる」effect より前からずっと追い続ける必要があるので、件数の
  // 変化とは別の effect として張る。
  useEffect(() => {
    const log = logRef.current
    if (log === null) {
      return
    }
    const updateNearBottom = (): void => {
      const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight
      nearBottomRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX
    }
    log.addEventListener("scroll", updateNearBottom)
    return () => {
      log.removeEventListener("scroll", updateNearBottom)
    }
  }, [])

  // React の外にある DOM（スクロール位置）への書き込み。**下端付近を読んでいたときだけ**
  // 最新へ寄せる（読み返している最中に下へ攫わない。docs/screen-design.md 13.7）。
  //
  // 呼ぶのは2か所で、**どちらも同じこの規則に従う**: 件数が増えたとき（下の effect）と、
  // 末尾のセリフが育って高さが伸びたとき（その下の effect）。**育っている最中に上へ転がせば
  // そこで追従が外れる**（寄せた直後の `scroll` は下端に居るままなので、自分で自分を外さない）。
  const stickToBottom = useCallback(() => {
    const log = logRef.current
    if (log === null || !nearBottomRef.current) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [])

  useEffect(() => {
    if (count === 0) {
      return
    }
    stickToBottom()
  }, [count, stickToBottom])

  // 外部システム（DOM の文字の変化）の購読。**末尾のセリフは1文字ずつ増えて育つ**
  // （`use-speech-growth.ts`）ので、件数が変わらないまま高さが伸びる。伸びたぶんを同じ規則で
  // 追いかける口がここ。
  //
  // **行の側から知らせ返さない**（育っている行がログのスクロールを知らずに済む）。見るのは
  // 文字の変化だけなので、押して印が移ったとき（class と `aria-pressed` が変わるだけ）には
  // 動かない。
  useEffect(() => {
    const log = logRef.current
    if (log === null) {
      return
    }
    const observer = new MutationObserver(stickToBottom)
    observer.observe(log, { subtree: true, characterData: true, childList: true })
    return () => {
      observer.disconnect()
    }
  }, [stickToBottom])

  return logRef
}
