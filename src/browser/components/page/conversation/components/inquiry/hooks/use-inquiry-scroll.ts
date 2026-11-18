// お伺いのカードまで連れてくるフック。
// 合図は4つで、新しい答え待ちが来たとき（`askId` が変わる）と、フォーカスした選択肢が替わったとき（詳細が出入りして札の高さが変わる）と、`useInquiryJump` の合図が変わったときと、頭が見えている札が伸びたとき。
// 詳細の中身は読み込みを待って遅れて描かれるので、選択肢が替わった時点では札はまだ伸びておらず、伸びるのは送ったあとになる。

import { useRef, type RefObject } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import type { InquiryJump } from "../../../../../../stores/inquiry-jump.ts"
import { smoothScrollBehavior } from "../../../../../../utils/smooth-scroll.ts"
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
  const heightRef = useRef(0)
  // 札が付く前に呼ばれた合図は、あとから付いた札では拾わない（勝手にフォーカスを移さない）。
  const handledSignalRef = useRef(jump.signal)
  const askId = inquiry.kind === "none" ? undefined : inquiry.id
  const focusedLabel =
    inquiry.kind !== "none" && inquiry.focusedLabel.kind === "option"
      ? inquiry.focusedLabel.label
      : undefined

  // 中身が入れ替わって先頭へ戻すスクロール（`useActiveTurnScroll`。親の effect なので札より後に走る）に打ち消されないよう、次の描画で連れてくる。
  useExternalSync(() => {
    if (askId === undefined) {
      return undefined
    }
    const frame = requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: smoothScrollBehavior() })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [askId])

  useExternalSync(() => {
    const card = cardRef.current
    if (askId === undefined || card === null) {
      return undefined
    }
    heightRef.current = card.getBoundingClientRect().height
    const observer = new ResizeObserver(() => {
      const box = card.getBoundingClientRect()
      const grew = box.height > heightRef.current
      heightRef.current = box.height
      // 利用者が札の頭を見ているときだけ送る。転がして札から離れていたら動かさない。
      if (grew && isTopInView(box, viewportOf(card))) {
        card.scrollIntoView({ block: "nearest", behavior: smoothScrollBehavior() })
      }
    })
    observer.observe(card)
    return () => {
      observer.disconnect()
    }
  }, [askId])

  useExternalSync(() => {
    if (focusedLabel === undefined) {
      return
    }
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: smoothScrollBehavior() })
  }, [focusedLabel])

  useExternalSync(() => {
    if (jump.signal === handledSignalRef.current) {
      return
    }
    handledSignalRef.current = jump.signal
    const card = cardRef.current
    card?.scrollIntoView({ block: "nearest", behavior: smoothScrollBehavior() })
    if (jump.focus) {
      card?.querySelector<HTMLElement>(FIRST_CHOICE_SELECTOR)?.focus({ preventScroll: true })
    }
  }, [jump])

  return cardRef
}

type VerticalSpan = { readonly top: number; readonly bottom: number }

function isTopInView(box: VerticalSpan, viewport: VerticalSpan): boolean {
  return box.top >= viewport.top && box.top < viewport.bottom
}

/** 札をいちばん近くで転がす祖先の見える範囲。無ければ画面の見える範囲。 */
function viewportOf(element: HTMLElement): VerticalSpan {
  const parent = element.parentElement
  if (parent === null) {
    return { top: 0, bottom: window.innerHeight }
  }
  const overflowY = getComputedStyle(parent).overflowY
  return overflowY === "auto" || overflowY === "scroll"
    ? parent.getBoundingClientRect()
    : viewportOf(parent)
}
