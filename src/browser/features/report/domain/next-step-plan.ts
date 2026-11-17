// レポートにすでにある欄（`Options`・`Claims`・`sessionRemaining`・`task.outcome`）から、末尾に並べる次の一手を作る。
// 下書きは入力欄へそのまま入るので、利用者が打つ依頼の文（命令形）で作る。状態を言う文（`sessionRemaining`）は札の字にだけ使い、下書きへ写さない。

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportChecksView } from "../../../../shared/report/report-check-view.ts"
import type { ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../../shared/session/session-digest.ts"
import { favorOptionsOf } from "./favor-option-list.ts"

export type NextStepAlternative = {
  readonly name: string
  /** 入力欄に足す下書き。 */
  readonly draft: string
}

export type NextStepUnobserved = {
  readonly label: string
  readonly howToVerify: string
}

/** 対にして出す確かめていない検証の行の上限。超えた分は `verify` の1つにまとめる。 */
const MAX_CHECK_RESULT_ROWS = 2

/**
 * `alternative` は押すと案を選ぶ欄を開き、選んだ案の下書きを入れる。
 * `check-result` は「確かめた」「違った」の対で、押すとそれぞれの下書きを入れる。ほかは押すとそのまま `draft` を入れる。
 */
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
  | {
      readonly kind: "check-result"
      readonly label: string
      readonly confirmedDraft: string
      readonly mismatchDraft: string
    }

type NextStepSource = {
  readonly components: readonly A2uiReportComponent[]
  readonly unobserved: readonly NextStepUnobserved[]
  readonly sessionRemaining: SessionRemaining
  readonly outcome?: ReportTaskOutcome
}

/** 検証結果のうち、確かめていなくて確かめ方を持つ行。 */
export function unobservedOf(checks: ReportChecksView): readonly NextStepUnobserved[] {
  return checks.kind === "checks"
    ? checks.problems.filter((row) => row.status === "unobserved" && row.howToVerify.trim() !== "")
    : []
}

/**
 * `check-result` 以外は種類ごとに最大1つ。並びは 再開する → 続ける → 確かめる → 確かめた・違った（行ごと） → 別の案で進める。元の欄が無い種類は出さない。
 * お願いの選択肢（`favorOptions`）があるレポートは、書き手が次の依頼を札で並べているので「続ける」を足さない。
 */
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

  if (favorOptionsOf(source.components).length === 0) {
    steps.push(...continueStepsOf(source.sessionRemaining, options))
  }

  const uncertain = claims.filter((claim) => claim.certainty !== "confirmed")
  const overflow = source.unobserved.slice(MAX_CHECK_RESULT_ROWS)
  if (uncertain.length > 0 || overflow.length > 0) {
    const inferred = uncertain.filter((claim) => claim.certainty === "inferred").length
    const unverified = uncertain.length - inferred
    const total = uncertain.length + overflow.length
    const count =
      overflow.length > 0 || (unverified > 0 && inferred > 0)
        ? `${total} 件`
        : unverified === 0
          ? `推測 ${inferred} 件`
          : `未確認 ${unverified} 件`
    const lines = [
      ...uncertain.map((claim) => ({ text: claim.claim, how: claim.howToVerify })),
      ...overflow.map((row) => ({ text: row.label, how: row.howToVerify })),
    ].flatMap((line, index) => {
      const head = `${index + 1}. ${line.text}`
      const how = line.how.trim()
      return how === "" ? [head] : [head, `   確かめ方: ${how}`]
    })
    steps.push({
      kind: "verify",
      label: `確かめる: ${count}`,
      draft: ["次の点を確かめて。", ...lines].join("\n"),
    })
  }

  for (const row of source.unobserved.slice(0, MAX_CHECK_RESULT_ROWS)) {
    steps.push({
      kind: "check-result",
      label: row.label,
      confirmedDraft: `${quoted(row.label)}を確かめた。問題なかった。`,
      mismatchDraft: `${quoted(row.label)}を確かめたら、違っていた。`,
    })
  }

  const alternatives = options
    .filter((item) => item.verdict !== "adopt")
    .map((item) => ({ name: item.name, draft: `${quoted(item.name)}で進めて。` }))
  if (alternatives.length > 0) {
    steps.push({ kind: "alternative", label: "別の案で進める", alternatives })
  }

  return steps
}

/**
 * 「続ける」の一手。あれば1つ、無ければ空。
 * 残りの作業があればそれを札の字にし、下書きは残りの文を写さず「続きを進めて。」にする。
 * 残りの作業が無く `Options` に採った案があれば、その案で進める依頼にする。
 */
function continueStepsOf(
  remaining: SessionRemaining,
  options: readonly { readonly name: string; readonly verdict: string }[],
): readonly NextStep[] {
  const remainingText = remaining.kind === "remaining" ? remaining.text.trim() : ""
  if (remainingText !== "") {
    return [{ kind: "continue", label: `続ける: ${remainingText}`, draft: "続きを進めて。" }]
  }
  const adopted = options.find((item) => item.verdict === "adopt")?.name.trim() ?? ""
  return adopted === ""
    ? []
    : [{ kind: "continue", label: `続ける: ${adopted}`, draft: `${quoted(adopted)}で進めて。` }]
}

/** 名前を依頼の文の中に置くときの括り。名前の中の空白や読点で、文の切れ目が分からなくならないようにする。 */
function quoted(name: string): string {
  return `「${name}」`
}
