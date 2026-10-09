// 狭い画面の「済んだ段 · 中間レポート」の一覧の行。
// やり取りのステップのうち本文を持つ中間レポート（段のまとめと `report` ツールの途中の本文）を、古い順に1行ずつにする。

import type {
  MainViewPhaseLabel,
  MainViewStep,
  MainViewStepBody,
  MainViewTurn,
} from "../../../../../../../shared/session/main-view.ts"

type TextBody = Extract<MainViewStepBody, { readonly kind: "text" }>

/** 一覧の行1つ。`stepId` は行の鍵と、板で開いている行の指し先。 */
export type PhaseRow = {
  readonly stepId: number
  /** 1 から数えた一覧の中の位置。 */
  readonly number: number
  readonly title: string
  /** 「2:16」の形の所要。測れていなければ空。 */
  readonly duration: string
  readonly body: TextBody
}

/** 前後の行。端では `none`。 */
export type PhaseNeighbor =
  | { readonly kind: "none" }
  | { readonly kind: "row"; readonly row: PhaseRow }

/** 段のまとめの見出し「2/4 段の名前」「2·3/4 …」の頭の位置。題からは外す。 */
const POSITION_PREFIX = /^\d+(?:·\d+)*\/\d+\s+/u

export function phaseRowsOf(turn: MainViewTurn): readonly PhaseRow[] {
  return turn.steps.filter(isInterimText).map((step, index) => ({
    stepId: step.id,
    number: index + 1,
    title: titleOf(step.body),
    duration: durationOf(step.body.finishedPhase),
    body: step.body,
  }))
}

/** 板の頭と下端の「n/N」の N。段取りがあれば段の数（一覧より少なければ一覧の数）、無ければ一覧の数。 */
export function phaseTotal(rows: readonly PhaseRow[], planCount: number): number {
  return Math.max(rows.length, planCount)
}

export function neighborRow(
  rows: readonly PhaseRow[],
  stepId: number,
  direction: "previous" | "next",
): PhaseNeighbor {
  const index = rows.findIndex((row) => row.stepId === stepId)
  const row = index === -1 ? undefined : rows[direction === "previous" ? index - 1 : index + 1]
  return row === undefined ? { kind: "none" } : { kind: "row", row }
}

function isInterimText(step: MainViewStep): step is MainViewStep & { readonly body: TextBody } {
  return step.interim && step.body.kind === "text"
}

function titleOf(body: TextBody): string {
  return body.finishedPhase.kind === "phase"
    ? body.firstLine.replace(POSITION_PREFIX, "")
    : body.firstLine
}

/** 「2:16」の形。測れていなければ空。 */
function durationOf(phase: MainViewPhaseLabel): string {
  if (phase.kind !== "phase" || phase.duration.kind !== "known") {
    return ""
  }
  const seconds = Math.round(phase.duration.milliseconds / 1000)
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`
}
