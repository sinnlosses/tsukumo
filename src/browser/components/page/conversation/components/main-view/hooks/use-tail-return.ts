// 流れを上へ送って読んでいるあいだだけ「末尾へ」の口を出すための値。
// 転がりは `document` の capture で1フレームに1回拾う（転がる祖先は画面の幅で入れ替わる）。

import { useRef, useState, type RefObject } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { useMountEffect } from "../../../../../../hooks/use-mount-effect.ts"
import { scrollerOf } from "../../../../../../utils/scroller.ts"
import { smoothScrollBehavior } from "../../../../../../utils/smooth-scroll.ts"
import {
  anchorAfterScroll,
  tailReturnOf,
  type TailAnchor,
  type TailReturn,
} from "../domain/tail-return.ts"
import { subscribeScrollFrame } from "./scroll-frame.ts"

const AT_TAIL = { kind: "at-tail" } as const satisfies TailAnchor

export type TailReturnModel = {
  readonly tail: TailReturn
  /** 流れの末尾まで転がす。 */
  readonly onReturn: () => void
}

/**
 * @param rootRef メインビューの根（転がる祖先をここから辿る）
 * @param count 並んでいる行の件数
 * @param active 末尾を追っているあいだか（最新のやり取りの作業中）。外れたら離れた印を捨てる
 */
export function useTailReturn(
  rootRef: RefObject<HTMLElement | null>,
  count: number,
  active: boolean,
): TailReturnModel {
  const [anchor, setAnchor] = useState<TailAnchor>(AT_TAIL)
  const countRef = useRef(count)

  useExternalSync(() => {
    countRef.current = count
  }, [count])

  useExternalSync(() => {
    if (!active) {
      setAnchor(AT_TAIL)
    }
  }, [active])

  useMountEffect(() =>
    subscribeScrollFrame(() => {
      const root = rootRef.current
      if (root === null) {
        return
      }
      const scroller = scrollerOf(root)
      setAnchor((previous) => anchorAfterScroll(previous, scroller, countRef.current))
    }),
  )

  return {
    tail: tailReturnOf(anchor, count, active),
    onReturn: () => {
      const root = rootRef.current
      if (root === null) {
        return
      }
      const scroller = scrollerOf(root)
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: smoothScrollBehavior() })
    },
  }
}
