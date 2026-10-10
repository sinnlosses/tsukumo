// お伺いの札が窓に見えているかを読んで store に書くフック。
// 札の一部でも見えていれば見えている。札が消える・観測をやめるときは見えているに戻す。

import { useEffect, type RefObject } from "react"

import { useInquiryCardVisibility } from "../../../../../../stores/inquiry-card-visibility.ts"

/** `observing` が false のあいだは観測しない（札が無い・狭い画面の板の中の札）。 */
export function useInquiryVisibility(
  cardRef: RefObject<HTMLElement | null>,
  observing: boolean,
): void {
  useEffect(() => {
    const card = cardRef.current
    if (!observing || card === null) {
      return
    }
    const { setVisible } = useInquiryCardVisibility.getState()
    const observer = new IntersectionObserver((entries) => {
      const latest = entries.at(-1)
      if (latest !== undefined) {
        setVisible(latest.isIntersecting)
      }
    })
    observer.observe(card)
    return () => {
      observer.disconnect()
      setVisible(true)
    }
  }, [cardRef, observing])
}
