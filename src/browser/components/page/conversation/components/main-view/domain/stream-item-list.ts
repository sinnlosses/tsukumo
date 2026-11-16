// 選んだやり取りの流れの行（`conversationStreamRows`）に、メインビューの畳み（`MainViewTurn`）が持つ本文・質問の記録を載せて、描く順の並びにする。
// 本文（レポート・中間の本文）は畳みの側が組んでいるので、記録の位置に差し込むだけで、組み直さない。
//
// 本文と記録の突き合わせ:
// - `report` は同じ `toolUseId` を持つ `origin.kind === "tool-report"` のステップ
// - `detail` は、まだ使っていない `origin.kind === "other"` のステップのうち段のまとめを持たないもの（届いた順）
// - `work-plan` は、直前の `work-plan` の記録との差で段を済ませた記録だけが、同じく段のまとめを持つものを1件（届いた順）取る。段を進めない呼び直しは取らない
// - 突き合わせの外に残った本文・質問の記録（書きかけの本文など）は、ステップの順に末尾（失敗の表示の手前）へ並べる
//
// 最終レポートがあるやり取りは、最終レポートより前の段の札・セリフ・補足の投稿・質問の記録・本文を、最終レポートの上の「作業の経過」1つに畳む。
// 依頼の投稿と、最終レポートより後ろの行は畳まない。

import type {
  MainViewQuestion,
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../shared/session/main-view-shape.ts"
import type { SessionRecord } from "../../../../../../../shared/session/session-record.ts"
import { workPlanOf } from "../../../../../../../shared/session/work-plan-fold.ts"
import { phaseShiftOf } from "../../../../../../../shared/session/work-plan-shift.ts"
import type { LatestWorkPlan } from "../../../../../../../shared/session/work-plan.ts"
import type { ConversationStreamRow } from "../../../../../../domain/main-view/conversation-stream.ts"
import { progressFoldSummary, type ProgressEntry } from "./turn-arrangement.ts"

type RecordOf<K extends SessionRecord["kind"]> = Extract<SessionRecord, { readonly kind: K }>

type PlanItem = { readonly kind: "plan"; readonly record: RecordOf<"work-plan"> }

type SpokenItem = Extract<ConversationStreamRow, { readonly kind: "post" | "say" }> & {
  /** 紙の直後に届いたセリフで、紙の前へ移した締めのセリフ。 */
  readonly closing?: true
}

/** 作業の経過に畳める1件。 */
export type ProgressItem =
  | PlanItem
  | SpokenItem
  | { readonly kind: "body"; readonly step: MainViewStep }
  | { readonly kind: "question"; readonly entry: MainViewQuestion }

/** 流れの最上位に並べる1件。段の札は「作業の経過」の中にだけ入る。 */
export type StreamItem =
  | { readonly kind: "failure" }
  | Exclude<ProgressItem, PlanItem>
  | { readonly kind: "answer"; readonly entry: MainViewQuestion }
  | { readonly kind: "fold"; readonly items: readonly ProgressItem[] }

type ArrangedItem = StreamItem | PlanItem

/** 流れの描く順の並び。 */
export function streamItemsOf(
  rows: readonly ConversationStreamRow[],
  turn: MainViewTurn,
): readonly StreamItem[] {
  // 同じ `toolUseId` の記録が重なっても、届いた順に1つずつ引き当てる。
  const reportBodies = new Map<string, MainViewStep[]>()
  const questions = new Map<string, MainViewQuestion>()
  const others: MainViewStep[] = []
  for (const step of turn.steps) {
    if (step.body.kind === "text") {
      if (step.origin.kind === "tool-report") {
        reportBodies.set(step.origin.toolUseId, [
          ...(reportBodies.get(step.origin.toolUseId) ?? []),
          step,
        ])
      } else {
        others.push(step)
      }
    }
    for (const action of step.actions) {
      if (action.kind === "question") {
        questions.set(action.toolUseId, action)
      }
    }
  }
  const placedSteps = new Set<MainViewStep>()
  const placedQuestions = new Set<string>()

  /** まだ使っていない中間の本文を1つ（無ければ空）。段のまとめを持つかどうかで、段の記録用か本文の記録用かを分ける。 */
  function takeOther(withPhase: boolean): readonly MainViewStep[] {
    const found = others.find(
      (step) =>
        !placedSteps.has(step) &&
        step.body.kind === "text" &&
        (step.body.finishedPhase.kind === "phase") === withPhase,
    )
    if (found === undefined) {
      return []
    }
    placedSteps.add(found)
    return [found]
  }

  const items: ArrangedItem[] = []
  let previousPlan: LatestWorkPlan = { kind: "none" }
  // 紙の前へ移した締めのセリフの、記録の位置。
  const movedSays = new Set<number>()
  for (const [index, row] of rows.entries()) {
    switch (row.kind) {
      case "post":
        items.push(row)
        break
      case "say":
        if (!movedSays.has(index)) {
          items.push(row)
        }
        break
      case "failure":
        break
      case "step": {
        if (row.record.kind === "work-plan") {
          items.push({ kind: "plan", record: row.record })
          const finishesPhase = phaseShiftOf(previousPlan, row.record).finished.kind === "finished"
          previousPlan = workPlanOf(row.record)
          if (finishesPhase) {
            for (const step of takeOther(true)) {
              items.push({ kind: "body", step })
            }
          }
          break
        }
        for (const step of takeOther(false)) {
          items.push({ kind: "body", step })
        }
        break
      }
      case "question": {
        const entry = questions.get(row.record.toolUseId)
        if (entry !== undefined) {
          placedQuestions.add(entry.toolUseId)
          items.push({ kind: "question", entry })
        }
        break
      }
      case "report": {
        const step = reportBodies.get(row.record.toolUseId)?.shift()
        if (step !== undefined) {
          placedSteps.add(step)
          const next = rows[index + 1]
          if (next?.kind === "say" && next.origin === "speech") {
            movedSays.add(index + 1)
            items.push({ ...next, closing: true })
          }
          items.push({ kind: "body", step })
        }
        break
      }
    }
  }

  const leftovers = turn.steps.flatMap((step): StreamItem[] => [
    ...(step.body.kind === "text" && !placedSteps.has(step)
      ? [{ kind: "body", step } as const]
      : []),
    ...step.actions.flatMap((action): StreamItem[] =>
      action.kind === "question" && !placedQuestions.has(action.toolUseId)
        ? [{ kind: "question", entry: action }]
        : [],
    ),
  ])
  const folded = foldProgress([...items, ...leftovers])
    .filter(isStreamItem)
    .flatMap((item): StreamItem[] =>
      item.kind === "question" && item.entry.answers.length > 0
        ? [item, { kind: "answer", entry: item.entry }]
        : [item],
    )
  return turn.failure.kind === "failed" ? withFailure(folded) : folded
}

/** 間隔を揃える1組。`speaker` は組の頭の行が利用者の投稿かどうか。`start` は組の頭の行が全体で何番目か。 */
export type StreamGroup = {
  readonly items: readonly StreamItem[]
  readonly start: number
  readonly speaker: "user" | "other"
}

/**
 * 隣り合う物とセリフを、並べ替えずに1組へ畳む。
 * 物は後ろのセリフと先に組み、後ろがセリフでないときだけ前のセリフと組む。1行は1組にしか入らない。
 */
export function streamGroupsOf(items: readonly StreamItem[]): readonly StreamGroup[] {
  const isThing = (item: StreamItem) =>
    item.kind !== "say" && item.kind !== "post" && item.kind !== "answer"
  const groups: StreamItem[][] = []
  // 物と組んだセリフの添字。
  const used = new Set<number>()
  items.forEach((item, index) => {
    if (used.has(index)) {
      return
    }
    const next = items[index + 1]
    if (isClosingSay(item)) {
      if (next !== undefined && isThing(next)) {
        used.add(index + 1)
        groups.push([item, next])
      } else {
        groups.push([item])
      }
      return
    }
    if (!isThing(item)) {
      groups.push([item])
      return
    }
    if (next?.kind === "say" && !isClosingSay(next)) {
      used.add(index + 1)
      groups.push([item, next])
      return
    }
    const previous = groups[groups.length - 1]
    if (previous?.length === 1 && previous[0]?.kind === "say") {
      previous.push(item)
      return
    }
    groups.push([item])
  })
  let start = 0
  return groups.map((group) => {
    const placed: StreamGroup = {
      items: group,
      speaker: group[0]?.kind === "post" || group[0]?.kind === "answer" ? "user" : "other",
      start,
    }
    start += group.length
    return placed
  })
}

/** 「作業の経過」の `<summary>` に出す字。件数・段ごとの所要は `progressFoldSummary` が組む。 */
export function foldSummaryOf(items: readonly ProgressItem[]): string {
  return `作業の${progressFoldSummary(items.flatMap(entryOf))}`
}

/** 失敗の表示は、最初の本文（畳み）の手前に置く。本文が無ければ末尾。 */
function withFailure(items: readonly StreamItem[]): readonly StreamItem[] {
  const at = items.findIndex((item) => item.kind === "body" || item.kind === "fold")
  const failure: StreamItem = { kind: "failure" }
  return at < 0 ? [...items, failure] : [...items.slice(0, at), failure, ...items.slice(at)]
}

function isStreamItem(item: ArrangedItem): item is StreamItem {
  return item.kind !== "plan"
}

function isClosingSay(item: ArrangedItem): boolean {
  return item.kind === "say" && item.closing === true
}

/** 最終レポートの締めのセリフは畳まず、畳みのすぐ後ろに残す。 */
function foldProgress(items: readonly ArrangedItem[]): readonly ArrangedItem[] {
  const finalAt = items.findIndex((item) => item.kind === "body" && item.step.mark === "final")
  if (finalAt < 0) {
    return items
  }
  const beforeFinal = items[finalAt - 1]
  const closingAt = beforeFinal !== undefined && isClosingSay(beforeFinal) ? finalAt - 1 : finalAt
  const before = items.slice(0, closingAt)
  const folded = before.filter(isProgress)
  if (folded.length === 0) {
    return items
  }
  return [
    ...before.filter((item) => !isProgress(item)),
    { kind: "fold", items: folded },
    ...items.slice(closingAt),
  ]
}

function isProgress(item: ArrangedItem): item is ProgressItem {
  return (
    item.kind === "plan" ||
    item.kind === "question" ||
    item.kind === "body" ||
    item.kind === "say" ||
    (item.kind === "post" && item.origin === "aside")
  )
}

function entryOf(item: ProgressItem): readonly ProgressEntry[] {
  switch (item.kind) {
    case "say":
      return [{ kind: "speech" }]
    case "post":
      return [{ kind: "aside-post" }]
    case "plan":
      return []
    case "body":
      return [{ kind: "interim", step: item.step }]
    case "question":
      return [{ kind: "question", entry: item.entry }]
  }
}
