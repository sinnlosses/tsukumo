// お伺いの札まで連れてくるフック。
// 合図は2つで、新しい答え待ちが来たとき（`askId` が変わる）と、`useInquiryJump` の合図が変わったとき。

import { useEffect, useRef, type RefObject } from "react"

import type { InquiryJump } from "../../../../../../stores/inquiry-jump.ts"

/** 札の中で最初にフォーカスを受ける選択肢。 */
const FIRST_CHOICE_SELECTOR = "input"

/**
 * お伺いの札に付ける ref。`block: "nearest"` なので、すでに見えている札では動かない。
 *
 * @param askId 答え待ちの id（無ければ undefined）。変わるたびに連れてくる
 * @param jump `useInquiryJump` の合図。`signal` が付いたときから変わったときだけ連れてくる。
 *   `focus` のときは最初の選択肢へフォーカスを移す
 */
export function useInquiryScroll(
  askId: string | undefined,
  jump: InquiryJump,
): RefObject<HTMLElement | null> {
  const cardRef = useRef<HTMLElement>(null)
  // 札が付く前に呼ばれた合図は、あとから付いた札では拾わない（勝手にフォーカスを移さない）。
  const handledSignalRef = useRef(jump.signal)

  useEffect(() => {
    if (askId === undefined) {
      return
    }
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [askId])

  useEffect(() => {
    if (jump.signal === handledSignalRef.current) {
      return
    }
    handledSignalRef.current = jump.signal
    const card = cardRef.current
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    if (jump.focus) {
      card?.querySelector<HTMLElement>(FIRST_CHOICE_SELECTOR)?.focus({ preventScroll: true })
    }
  }, [jump])

  return cardRef
}
