// やり取りの列のレポートの行が転がす先（見ているやり取りの本文の頭）を、本文の DOM から引く。

/** 本文を持つステップの札（`<section>`）が付ける属性。 */
export const REPORT_STEP_ATTRIBUTE = "data-report-step"

const REPORT_STEP_SELECTOR = `section[${REPORT_STEP_ATTRIBUTE}]`

/**
 * 見ているやり取りのレポートの札。
 * 最終レポートがあるやり取りは最終が先頭の札で、無ければ最後の札（畳んだ中間レポートは `<details>` で札にならない）。
 * 札が1つも無ければ本文の器そのもの。
 */
export function outlineReportHeadOf(content: HTMLElement, isFinal: boolean): HTMLElement {
  const steps = content.querySelectorAll<HTMLElement>(REPORT_STEP_SELECTOR)
  return (isFinal ? steps[0] : steps[steps.length - 1]) ?? content
}
