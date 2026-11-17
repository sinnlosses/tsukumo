// タブの見え隠れ。隠れていたタブが見えるようになった時刻を持つ（立ち絵が答え待ちをもう一度呼ぶ契機）。

import { useState } from "react"

import type { TabVisibility } from "../../../../../../domain/portrait-motion.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { nowEpochMilliseconds } from "../../../../../../utils/clock.ts"

export function useTabVisibility(): TabVisibility {
  const [tab, setTab] = useState<TabVisibility>(() =>
    document.hidden ? { kind: "hidden" } : { kind: "visible" },
  )
  const onVisibilityChange = (): void => {
    setTab(document.hidden ? { kind: "hidden" } : { kind: "returned", at: nowEpochMilliseconds() })
  }
  useEventListener(document, "visibilitychange", onVisibilityChange)
  return tab
}
