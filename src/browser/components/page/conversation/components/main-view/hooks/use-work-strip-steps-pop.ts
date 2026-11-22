// 進み具合のプログレスバーの全体の詳細を重ねる面の、開閉の写しと置き場所。
// 開閉の値は store が持つので、ここは今のやり取りで開いているかを読み、開いたときに帯を測って面の左上と幅を決め、閉じる要求を store へ渡す。

import { type RefObject, useRef, useState } from "react"

import { useBeforePaintSync } from "../../../../../../hooks/use-before-paint-sync.ts"
import { useEventListener } from "../../../../../../hooks/use-event-listener.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"

/** 面を帯の下端から離す幅。区間の下線に重ねない。 */
const POP_BELOW_GAP = 8

/** 面の左上（ビューポートの座標）と幅。左右の端を帯の左右の端に重ねる。 */
export type StepsPopPlace = { readonly left: number; readonly top: number; readonly width: number }

export type WorkStripStepsPop = {
  /** 「手順」の口。面はこの口に結ぶ。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
  readonly place: StepsPopPlace
  readonly onClose: () => void
}

const START_PLACE = { left: 0, top: 0, width: 0 } as const satisfies StepsPopPlace

export function useWorkStripStepsPop(): WorkStripStepsPop {
  const content = useMainViewContent((state) => state.content)
  const opened = useWorkStripSteps((state) => state.opened)
  const closeSteps = useWorkStripSteps((state) => state.closeSteps)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [place, setPlace] = useState<StepsPopPlace>(START_PLACE)
  const open =
    content.kind !== "welcome" && opened.kind === "steps" && opened.exchange === content.exchange

  const measure = (): void => {
    const strip = toggleRef.current?.closest("section")
    if (strip === null || strip === undefined) {
      return
    }
    const rect = strip.getBoundingClientRect()
    setPlace({ left: rect.left, top: rect.bottom + POP_BELOW_GAP, width: rect.width })
  }

  useBeforePaintSync(() => {
    if (open) {
      measure()
    }
  }, [open])

  useEventListener(window, "resize", measure, { enabled: open })

  return { toggleRef, place, onClose: closeSteps }
}
