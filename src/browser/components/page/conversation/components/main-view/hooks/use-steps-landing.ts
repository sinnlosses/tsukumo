// 失敗した手順を指して依頼の手順の一覧を開いたとき、最初の失敗の行までスクロールしてフォーカスを移すフック。

import { useRef, type RefObject } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import type { StepsLanding } from "../../../stores/work-strip-step-list.ts"

/** 失敗の行の印（`CurrentWorkStepGroup` の行に付く `data-step-failed`）。 */
const FAILED_STEP_SUMMARY = "[data-step-failed] summary"

/** 一覧の根に付ける ref。`landing` が `top` のときは何もしない。 */
export function useStepsLanding(landing: StepsLanding): RefObject<HTMLDivElement | null> {
  const listRef = useRef<HTMLDivElement>(null)

  useExternalSync(() => {
    const list = listRef.current
    if (list === null || landing.kind === "top") {
      return
    }
    const summary = list.querySelector<HTMLElement>(FAILED_STEP_SUMMARY)
    summary?.scrollIntoView({ block: "nearest" })
    summary?.focus({ preventScroll: true })
  }, [landing])

  return listRef
}
