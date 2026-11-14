// お伺いのカードまで連れてくるフック。
// 合図は3つで、新しい答え待ちが来たとき（`askId` が変わる）と、フォーカスした選択肢が替わったとき（詳細が出入りして札の高さが変わる）と、`useInquiryJump` の合図が変わったとき。

import { useRef, type RefObject } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import type { InquiryJump } from "../../../../../../stores/inquiry-jump.ts"
import type { InquiryModel } from "../../../stores/inquiry-answer.ts"

/** 札の中で最初にフォーカスを受ける選択肢。 */
const FIRST_CHOICE_SELECTOR = "input"

/**
 * お伺いのカードに付ける ref。`block: "nearest"` なので、すでに見えている札では動かない。
 *
 * @param inquiry いまの答え待ち。別の答え待ちに変わるたびと、フォーカスした選択肢が替わるたびに連れてくる
 * @param jump `useInquiryJump` の合図。`signal` が付いたときから変わったときだけ連れてくる。
 *   `focus` のときは最初の選択肢へフォーカスを移す
 */
export function useInquiryScroll(
  inquiry: InquiryModel,
  jump: InquiryJump,
): RefObject<HTMLElement | null> {
  const cardRef = useRef<HTMLElement>(null)
  // 札が付く前に呼ばれた合図は、あとから付いた札では拾わない（勝手にフォーカスを移さない）。
  const handledSignalRef = useRef(jump.signal)
  const askId = inquiry.kind === "none" ? undefined : inquiry.id
  const focusedLabel =
    inquiry.kind !== "none" && inquiry.focusedLabel.kind === "option"
      ? inquiry.focusedLabel.label
      : undefined

  useExternalSync(() => {
    if (askId === undefined) {
      return
    }
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [askId])

  useExternalSync(() => {
    if (focusedLabel === undefined) {
      return
    }
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [focusedLabel])

  useExternalSync(() => {
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
