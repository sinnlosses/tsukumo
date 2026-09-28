// 答え待ちの質問の札まで連れてくるフック。
// 合図は2つで、新しい質問が来たとき（`askId` が変わる）と、帯の「いまの作業」の一覧にある「質問へ」を押したとき（`useQuestionScroll` の `signal` が変わる）。

import { useEffect, useRef, type RefObject } from "react"

/**
 * 質問の札に付ける ref。`block: "nearest"` なので、すでに見えている札では動かない。
 *
 * @param askId 答え待ちの質問の id（無ければ undefined）。変わるたびに連れてくる
 * @param scrollSignal `useQuestionScroll` の合図。0 は初回描画（まだ一度も押されていない）なので何もしない。
 *   同じ質問を見ている間（`askId` が変わっていない間）は上の合図が働かないぶんをここで拾う
 */
export function useQuestionAskScroll(
  askId: string | undefined,
  scrollSignal: number,
): RefObject<HTMLElement | null> {
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (askId === undefined) {
      return
    }
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [askId])

  useEffect(() => {
    if (scrollSignal === 0) {
      return
    }
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [scrollSignal])

  return cardRef
}
