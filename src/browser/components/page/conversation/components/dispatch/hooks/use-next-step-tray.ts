// 入力欄の頭に次の一手の並びを出すかと、並びの見出しに合わせるお願いの知らせ。

import type { NextStep } from "../../../../../../features/report/next-step.ts"
import { useNextStepTray } from "../../../stores/next-step-tray.ts"
import { nextStepTrayVisible, type ComposerBandState } from "../domain/composer-band.ts"

/**
 * `favor` は、お願いが見えていないあいだだけ見出しの右端に出す知らせと、お願いの欄へ送る口。
 * `folded` は、利用者が今の元の並びを畳んだか。
 */
export type NextStepTrayModel =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly steps: readonly NextStep[]
      readonly folded: boolean
      readonly favor:
        | { readonly kind: "none" }
        | { readonly kind: "waiting"; readonly onJump: () => void }
    }

export function useNextStepTrayModel(
  state: ComposerBandState,
  onFavorJump: () => void,
): NextStepTrayModel {
  const steps = useNextStepTray((tray) => tray.steps)
  if (!nextStepTrayVisible(state)) {
    return { kind: "none" }
  }
  return {
    kind: "shown",
    steps,
    folded: state.trayFolded,
    favor: state.favorShown ? { kind: "waiting", onJump: onFavorJump } : { kind: "none" },
  }
}

/** 並びの先頭の札へフォーカスを移す。並びが描かれていなければ何もしない。 */
export function focusNextStepTray(): void {
  document
    .getElementById(NEXT_STEP_TRAY_ID)
    ?.querySelector<HTMLElement>(NEXT_STEP_CHIP_SELECTOR)
    ?.focus()
}

/** 並びの group の id。ページに入力欄は1つなので、並びも1つ。 */
export const NEXT_STEP_TRAY_ID = "next-step-tray"

/** 並びの札（案を開いたときの案の札を含む）。 */
export const NEXT_STEP_CHIP_SELECTOR = "[data-next-step-chip]"
