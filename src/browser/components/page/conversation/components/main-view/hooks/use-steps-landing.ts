// 失敗した手順を指して依頼の手順の一覧を開いたとき、最初の失敗の行までスクロールしてフォーカスを移すフック。

import { useRef, type RefObject } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import type { StepsLanding } from "../../../stores/work-strip-step-list.ts"

/** 失敗の行の開閉の見出し（`CurrentWorkStepGroup` の行の包みに付く `data-step-failed` の中のボタン）。 */
const FAILED_STEP_TRIGGER = "[data-step-failed] button[aria-expanded]"

/** 一覧の根に付ける ref。`landing` が `top` のときは何もしない。 */
export function useStepsLanding(landing: StepsLanding): RefObject<HTMLDivElement | null> {
  const listRef = useRef<HTMLDivElement>(null)

  useExternalSync(() => {
    const list = listRef.current
    if (list === null || landing.kind === "top") {
      return
    }
    const trigger = list.querySelector<HTMLElement>(FAILED_STEP_TRIGGER)
    trigger?.scrollIntoView({ block: "nearest" })
    trigger?.focus({ preventScroll: true })
  }, [landing])

  return listRef
}
