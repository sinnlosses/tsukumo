// 行や段を指して依頼の手順の一覧を開いたとき、指した先へ連れていくフック。
// 失敗した手順は最初の失敗の行までスクロールしてフォーカスを移し、下線の区間は一覧の中だけをスクロールしてそのフェーズの行を一覧の上端に置く。

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
    if (landing.kind === "failure") {
      const summary = list.querySelector<HTMLElement>(FAILED_STEP_SUMMARY)
      summary?.scrollIntoView({ block: "nearest" })
      summary?.focus({ preventScroll: true })
      return
    }
    // プログレスバーのフェーズの行（PhaseRow の li）に付く `data-phase-indexes`。
    const heading = list.querySelector<HTMLElement>(
      `[data-phase-indexes~="${String(landing.phaseIndex)}"]`,
    )
    if (heading !== null) {
      list.scrollTop += heading.getBoundingClientRect().top - list.getBoundingClientRect().top
    }
  }, [landing])

  return listRef
}
