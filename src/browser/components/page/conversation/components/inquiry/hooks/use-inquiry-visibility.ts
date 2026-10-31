// お伺いの札が窓に見えているかを読んで store に書く ref コールバック。
// 札の一部でも見えていれば見えている。札が消える・観測をやめるときは見えているに戻す。

import type { RefCallback } from "react"

import { useIntersectionObservedRef } from "../../../../../../hooks/use-observed-ref.ts"
import { useInquiryCardVisibility } from "../../../stores/inquiry-card-visibility.ts"

/** `observing` が false のあいだは観測しない（札が無い・狭い画面の板の中の札）。 */
export function useInquiryVisibility(observing: boolean): RefCallback<HTMLElement> {
  return useIntersectionObservedRef<HTMLElement>({
    enabled: observing,
    onIntersect: (entries) => {
      const latest = entries.at(-1)
      if (latest !== undefined) {
        useInquiryCardVisibility.getState().setVisible(latest.isIntersecting)
      }
    },
    init: () => ({}),
    onDetach: () => {
      useInquiryCardVisibility.getState().setVisible(true)
    },
  })
}
