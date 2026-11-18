// レポートにすでにある欄（`Options`・`Claims`・`sessionRemaining`・`task.outcome`）から、末尾に並べる次の一手を作る。
// 下書きは入力欄へそのまま入るので、利用者が打つ依頼の文（命令形）で作る。状態を言う文（`sessionRemaining`）は札の字にだけ使い、下書きへ写さない。

import { taskStartRequest } from "../../../../shared/recommendation/recommendation-order.ts"
import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { ReportChecksView } from "../../../../shared/report/report-check-view.ts"
import type { ReportTaskOutcome } from "../../../../shared/report/report-task.ts"
import type { SessionRemaining } from "../../../../shared/session/session-digest.ts"
import { favorOptionsOf } from "./favor-option-list.ts"

/** 次の一手の元になる、ステップの本文の外の欄。 */
export type NextStepsOrigin = {
  readonly sessionRemaining: SessionRemaining
  readonly outcome?: ReportTaskOutcome
  /** 着手できるタスクをおすすめの順に。タスクを終えたレポートだけが先頭から使う。 */
  readonly nextTasks?: readonly NextTaskCandidate[]
}

export type NextTaskCandidate = {
  readonly id: string
  readonly summary: string
}

/** タスクを終えたあとに並べる次のタスクの上限。 */
const MAX_NEXT_TASKS = 2

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
 * 札の字は `kindLabel`（種類の語）・`label`（主の字。`draft` の1行目）・`note`（添え書き。下書きの2行目以降、または続ける対象）。
 * `points` は下書きが並べる点の数（点を並べない下書きは 0）。
 */
export type NextStep =
  | {
      readonly kind: "resume" | "continue" | "verify"
      readonly kindLabel: string
      readonly label: string
      readonly note: string
      readonly draft: string
      readonly points: number
    }
  | {
      readonly kind: "next-task"
      readonly taskId: string
      readonly kindLabel: string
      readonly label: string
      readonly note: string
      readonly draft: string
      readonly points: number
    }
  | {
      readonly kind: "alternative"
      readonly kindLabel: string
      readonly alternatives: readonly NextStepAlternative[]
    }
  | {
      readonly kind: "check-result"
      readonly label: string
      readonly confirmedDraft: string
      readonly mismatchDraft: string
    }

type NextStepSource = NextStepsOrigin & {
  readonly components: readonly A2uiReportComponent[]
  readonly unobserved: readonly NextStepUnobserved[]
}

/** 検証結果のうち、確かめていなくて確かめ方を持つ行。 */
export function unobservedOf(checks: ReportChecksView): readonly NextStepUnobserved[] {
  return checks.kind === "checks"
    ? checks.problems.filter((row) => row.status === "unobserved" && row.howToVerify.trim() !== "")
    : []
}

/**
 * `check-result` と `next-task` 以外は種類ごとに最大1つ。並びは 再開する → 続ける → 確かめる → 確かめた・違った（行ごと） → 別の案で進める → 次のタスク（タスクを終えたときだけ、{@link MAX_NEXT_TASKS} 件まで）。元の欄が無い種類は出さない。
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
    steps.push(draftStep("resume", "再開する", "止めたところから再開して。", ""))
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
    steps.push(
      draftStep(
        "verify",
        `確かめる: ${count}`,
        ["次の点を確かめて。", ...lines].join("\n"),
        "",
        total,
      ),
    )
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
    steps.push({
      kind: "alternative",
      kindLabel: "別の案で進める",
      alternatives,
    })
  }

  if (source.outcome === "finished") {
    steps.push(...(source.nextTasks ?? []).slice(0, MAX_NEXT_TASKS).map(nextTaskStep))
  }

  return steps
}

/** 主の字は送る依頼の文。題は2行目に添え、下見と依頼の両方で何のタスクかが読めるようにする。 */
function nextTaskStep(task: NextTaskCandidate): NextStep {
  const request = taskStartRequest(task.id)
  return {
    kind: "next-task",
    taskId: task.id,
    kindLabel: "次のタスク",
    label: request,
    note: task.summary,
    draft: `${request}\n${task.summary}`,
    points: 0,
  }
}

/**
 * 「続ける」の一手。あれば1つ、無ければ空。
 * 残りの作業があればそれを札の字にする。下書きは残りの文を写さず、書き手が渡した続きの依頼の文があればそれ、無ければ「続きを進めて。」にする。
 * 残りの作業が無く `Options` に採った案があれば、その案で進める依頼にする。
 */
function continueStepsOf(
  remaining: SessionRemaining,
  options: readonly { readonly name: string; readonly verdict: string }[],
): readonly NextStep[] {
  const remainingText = remaining.kind === "remaining" ? remaining.text.trim() : ""
  if (remainingText !== "") {
    const request = remaining.kind === "remaining" ? (remaining.request?.trim() ?? "") : ""
    return [
      draftStep(
        "continue",
        "続ける",
        request === "" ? "続きを進めて。" : request,
        request === "" ? remainingText : "",
      ),
    ]
  }
  const adopted = options.find((item) => item.verdict === "adopt")?.name.trim() ?? ""
  return adopted === "" ? [] : [draftStep("continue", "続ける", `${quoted(adopted)}で進めて。`, "")]
}

/** 主の字は下書きの1行目、2行目以降は添え書きの頭に回す。`extra` は続ける対象など、下書きの外から足す添え書き。 */
function draftStep(
  kind: "resume" | "continue" | "verify",
  kindLabel: string,
  draft: string,
  extra: string,
  points = 0,
): NextStep {
  const [head = "", ...rest] = draft.split("\n")
  return {
    kind,
    kindLabel,
    label: head,
    note: [...rest, extra].filter(Boolean).join("\n"),
    draft,
    points,
  }
}

/** 名前を依頼の文の中に置くときの括り。名前の中の空白や読点で、文の切れ目が分からなくならないようにする。 */
function quoted(name: string): string {
  return `「${name}」`
}
