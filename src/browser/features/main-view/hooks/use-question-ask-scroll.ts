// 答え待ちの質問の札まで連れてくる1つだけの仕事を持つフック（docs/design.md 2章
// 「機能の中を分ける」。外の世界に触るフックだけを `question-ask.tsx` から出した）。
//
// 連れてくる合図は2つ——**新しい質問が来たとき**（`askId` が変わる）と、**帯の「いまの作業」の
// 一覧にある「質問へ」を押したとき**（`stores/question-scroll.tsx` の `signal` が変わる）。
// どちらも**React の外＝スクロール位置への書き込み**なので `useEffect` で同期する
// （`docs/coding-standards.md`「React」の4類型の2つ目）。

import { useEffect, useRef, type RefObject } from "react"

/**
 * 質問の札に付ける ref。`block: "nearest"` なので、すでに見えている札では動かない。
 *
 * @param askId 答え待ちの質問の id（`QuestionAnswer` の `asking.id`。無ければ undefined）。
 *   変わるたびに連れてくる
 * @param scrollSignal `stores/question-scroll.tsx` の合図。**0 は初回描画**（まだ一度も
 *   押されていない）なので何もしない。同じ質問を見ている間（`askId` が変わっていない間）は
 *   上の合図が働かないぶんをここで拾う
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
