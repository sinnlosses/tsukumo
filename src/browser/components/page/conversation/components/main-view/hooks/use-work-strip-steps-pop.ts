// 進み具合のプログレスバーの全体の詳細を、外を押す・Esc で閉じる。
// 開閉の値は store が持つので、ここは閉じる合図を受け、Esc のときだけ「手順」の口へフォーカスを戻す。

import { type RefObject, useRef } from "react"

import { useDismissSignal } from "../../../../../../hooks/use-dismiss-signal.ts"
import { useMainViewContent } from "../../../stores/main-view-content.ts"
import { useWorkStripSteps } from "../../../stores/work-strip-step-list.ts"

export type WorkStripStepsPop = {
  /** 「手順」の口・全体の詳細・区間の並びを包む要素に付ける。外の `pointerdown` はこの要素の外で数える。 */
  readonly rootRef: RefObject<HTMLDivElement | null>
  /** 「手順」の口。Esc で閉じたときにフォーカスを戻す。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}

export function useWorkStripStepsPop(): WorkStripStepsPop {
  const content = useMainViewContent((state) => state.content)
  const opened = useWorkStripSteps((state) => state.opened)
  const closeSteps = useWorkStripSteps((state) => state.closeSteps)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useDismissSignal({
    open:
      content.kind !== "welcome" && opened.kind === "steps" && opened.exchange === content.exchange,
    rootRef,
    onDismiss: (cause) => {
      closeSteps()
      if (cause === "escape") {
        toggleRef.current?.focus()
      }
    },
  })

  return { rootRef, toggleRef }
}
