// 失敗した手順を指して一覧を開いたとき、最初の失敗の行まで転がしてフォーカスを移すフック。

import { useEffect, useRef, type RefObject } from "react"

/** 失敗の行の印（`CurrentWorkStepGroup` の行に付く `data-step-failed`）。 */
const FAILED_STEP_SUMMARY = "[data-step-failed] summary"

/**
 * 一覧の根に付ける ref。
 *
 * @param failureSignal 失敗した手順を指して開いた合図。0 は「手順 n」の口で開いたときで、何もしない
 */
export function useFailedStepFocus(failureSignal: number): RefObject<HTMLDivElement | null> {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (failureSignal === 0) {
      return
    }
    const summary = listRef.current?.querySelector<HTMLElement>(FAILED_STEP_SUMMARY)
    summary?.scrollIntoView({ block: "nearest" })
    summary?.focus({ preventScroll: true })
  }, [failureSignal])

  return listRef
}
