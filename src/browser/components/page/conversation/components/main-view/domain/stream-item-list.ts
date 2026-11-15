// 選んだやり取りの流れの行（`conversationStreamRows`）に、メインビューの畳み（`MainViewTurn`）が持つ本文・質問の記録を載せて、描く順の並びにする。
// 本文（レポート・中間の本文）は畳みの側が組んでいるので、記録の位置に差し込むだけで、組み直さない。
//
// 本文と記録の突き合わせ:
// - `report` は同じ `toolUseId` を持つ `origin.kind === "tool-report"` のステップ
// - `detail` は、まだ使っていない `origin.kind === "other"` のステップのうち段のまとめを持たないもの（届いた順）
// - `work-plan` は、同じく段のまとめを持つもの（届いた順）。段が移らなかった記録は使わないので、まとめの位置は届いた順の近似
// - 突き合わせの外に残った本文・質問の記録（書きかけの本文など）は、ステップの順に末尾（失敗の表示の手前）へ並べる
//
// 最終レポートがあるやり取りは、最終レポートより前の段の札・質問の記録・本文を、最終レポートの上の「作業の経過」1つに畳む。

import type {
  MainViewQuestion,
  MainViewStep,
  MainViewTurn,
} from "../../../../../../../shared/session/main-view-shape.ts"
import type { SessionRecord } from "../../../../../../../shared/session/session-record.ts"
import type { ConversationStreamRow } from "../../../../../../domain/main-view/conversation-stream.ts"
import { progressFoldSummary, type ProgressEntry } from "./turn-arrangement.ts"

type RecordOf<K extends SessionRecord["kind"]> = Extract<SessionRecord, { readonly kind: K }>

type PlanItem = { readonly kind: "plan"; readonly record: RecordOf<"work-plan"> }

/** 作業の経過に畳める1件。 */
export type ProgressItem =
  | PlanItem
  | { readonly kind: "body"; readonly step: MainViewStep }
  | { readonly kind: "question"; readonly entry: MainViewQuestion }

/** 流れの最上位に並べる1件。段の札は「作業の経過」の中にだけ入る。 */
export type StreamItem =
  | Extract<ConversationStreamRow, { readonly kind: "post" | "say" }>
  | { readonly kind: "failure" }
  | Exclude<ProgressItem, PlanItem>
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
  for (const row of rows) {
    switch (row.kind) {
      case "post":
      case "say":
        items.push(row)
        break
      case "failure":
        break
      case "step": {
        if (row.record.kind === "work-plan") {
          items.push({ kind: "plan", record: row.record })
        }
        for (const step of takeOther(row.record.kind === "work-plan")) {
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
  const folded = foldProgress([...items, ...leftovers]).filter(isStreamItem)
  return turn.failure.kind === "failed" ? withFailure(folded) : folded
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

function foldProgress(items: readonly ArrangedItem[]): readonly ArrangedItem[] {
  const finalAt = items.findIndex((item) => item.kind === "body" && item.step.mark === "final")
  if (finalAt < 0) {
    return items
  }
  const before = items.slice(0, finalAt)
  const folded = before.filter(isProgress)
  if (folded.length === 0) {
    return items
  }
  return [
    ...before.filter((item) => !isProgress(item)),
    { kind: "fold", items: folded },
    ...items.slice(finalAt),
  ]
}

function isProgress(item: ArrangedItem): item is ProgressItem {
  return item.kind === "plan" || item.kind === "question" || item.kind === "body"
}

function entryOf(item: ProgressItem): readonly ProgressEntry[] {
  switch (item.kind) {
    case "plan":
      return []
    case "body":
      return [{ kind: "interim", step: item.step }]
    case "question":
      return [{ kind: "question", entry: item.entry }]
  }
}
