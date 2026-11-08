// レポートにすでにある欄（`Options`・`Claims`・`sessionRemaining`・`task.outcome`）から、末尾に並べる次の一手を作る。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../../shared/session/session-digest.ts"

export type NextStepAlternative = {
  readonly name: string
  /** 入力欄に足す下書き。 */
  readonly draft: string
}

/** `alternative` は押すと案を選ぶ欄を開き、選んだ案の下書きを入れる。ほかは押すとそのまま `draft` を入れる。 */
export type NextStep =
  | {
      readonly kind: "resume" | "continue" | "verify"
      readonly label: string
      readonly draft: string
    }
  | {
      readonly kind: "alternative"
      readonly label: string
      readonly alternatives: readonly NextStepAlternative[]
    }

type NextStepSource = {
  readonly components: readonly A2uiReportComponent[]
  readonly sessionRemaining: SessionRemaining
  readonly outcome?: ReportTaskOutcome
}

/** 種類ごとに最大1つ。並びは 再開する → 続ける → 確かめる → 別の案で進める。元の欄が無い種類は出さない。 */
export function buildNextSteps(source: NextStepSource): readonly NextStep[] {
  const options = source.components.flatMap((component) =>
    component.component === "Options" ? component.items : [],
  )
  const claims = source.components.flatMap((component) =>
    component.component === "Claims" ? component.items : [],
  )
  const steps: NextStep[] = []

  if (source.outcome === "stopped") {
    steps.push({ kind: "resume", label: "再開する", draft: "止めたところから再開して。" })
  }

  const remaining = source.sessionRemaining
  const continueText =
    remaining.kind === "remaining" && remaining.text.trim() !== ""
      ? remaining.text.trim()
      : options.find((item) => item.verdict === "adopt")?.name.trim()
  if (continueText !== undefined && continueText !== "") {
    steps.push({
      kind: "continue",
      label: `続ける: ${continueText}`,
      draft: `続けて。${continueText}`,
    })
  }

  const uncertain = claims.filter((claim) => claim.certainty !== "confirmed")
  if (uncertain.length > 0) {
    const inferred = uncertain.filter((claim) => claim.certainty === "inferred").length
    const unverified = uncertain.length - inferred
    const count =
      unverified === 0
        ? `推測 ${inferred} 件`
        : inferred === 0
          ? `未確認 ${unverified} 件`
          : `${uncertain.length} 件`
    const lines = uncertain.flatMap((claim, index) => {
      const head = `${index + 1}. ${claim.claim}`
      const how = claim.howToVerify.trim()
      return how === "" ? [head] : [head, `   確かめ方: ${how}`]
    })
    steps.push({
      kind: "verify",
      label: `確かめる: ${count}`,
      draft: ["確かめて。", ...lines].join("\n"),
    })
  }

  const alternatives = options
    .filter((item) => item.verdict !== "adopt")
    .map((item) => ({ name: item.name, draft: `${item.name} で進めて。` }))
  if (alternatives.length > 0) {
    steps.push({ kind: "alternative", label: "別の案で進める", alternatives })
  }

  return steps
}
