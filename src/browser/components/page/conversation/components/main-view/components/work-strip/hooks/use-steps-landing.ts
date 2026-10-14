// 行や段を指して依頼の手順の一覧を開いたとき、指した先へ連れていくフック。
// 失敗した手順は最初の失敗の行まで転がしてフォーカスを移し、段は一覧の中だけを転がしてその段の区切りを一覧の上端に置く。

import { useEffect, useRef, type RefObject } from "react"

import type { StepsLanding } from "../../../../../../../../stores/work-strip-steps.ts"

/** 失敗の行の印（`CurrentWorkStepGroup` の行に付く `data-step-failed`）。 */
const FAILED_STEP_SUMMARY = "[data-step-failed] summary"

/** 一覧の根に付ける ref。`landing` が `top` のときは何もしない。 */
export function useStepsLanding(landing: StepsLanding): RefObject<HTMLDivElement | null> {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
    // `CurrentWorkStepGroup` の段の小見出しに付く `data-phase-indexes`（空白区切り）。新しい区切りが上にある。
    const heading = list.querySelector<HTMLElement>(
      `[data-phase-indexes~="${String(landing.phaseIndex)}"]`,
    )
    if (heading !== null) {
      list.scrollTop += heading.getBoundingClientRect().top - list.getBoundingClientRect().top
    }
  }, [landing])

  return listRef
}
