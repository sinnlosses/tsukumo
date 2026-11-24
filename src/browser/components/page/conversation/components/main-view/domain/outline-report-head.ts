// やり取りの列のレポートの行が転がす先（見ているやり取りの本文の頭）を、本文の DOM から引く。

/** 本文を持つステップの札（`<section>`・畳める中間レポートの `<details>`）が付ける属性。 */
export const REPORT_STEP_ATTRIBUTE = "data-report-step"

/** 札の属性の値。最終レポートの札だけがこの値を持つ。 */
export const REPORT_STEP_FINAL_VALUE = "final"

const REPORT_STEP_SELECTOR = `[${REPORT_STEP_ATTRIBUTE}]`
const FINAL_REPORT_STEP_SELECTOR = `[${REPORT_STEP_ATTRIBUTE}="${REPORT_STEP_FINAL_VALUE}"]`

/**
 * 見ているやり取りのレポートの札。
 * 最終レポートがあるやり取りは最終レポートの札で、無ければ最後の札（中間レポートの `<details>` も札）。
 * 札が1つも無ければ本文の器そのもの。
 */
export function outlineReportHeadOf(content: HTMLElement, isFinal: boolean): HTMLElement {
  const finalStep = isFinal
    ? content.querySelector<HTMLElement>(FINAL_REPORT_STEP_SELECTOR)
    : undefined
  if (finalStep) {
    return finalStep
  }
  const steps = content.querySelectorAll<HTMLElement>(REPORT_STEP_SELECTOR)
  return steps[steps.length - 1] ?? content
}
