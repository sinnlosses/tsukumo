// 離れていたあいだに流れへ足された行の手前に出す境目の線を、どこに・何と書いて出すか決める。

import type { MainViewStep } from "../../../../../../../shared/session/main-view-shape.ts"
import type { ConversationStreamRow } from "../../../../../../domain/main-view/conversation-stream.ts"
import type { Away } from "../../../domain/away-seam.ts"
import type { ProgressItem, StreamItem } from "./stream-item-list.ts"

const MS_PER_MINUTE = 60_000

export type AwaySeam =
  | { readonly kind: "none" }
  | {
      readonly kind: "seam"
      /** 線を差し込む位置。`items` のこの番号の手前。 */
      readonly before: number
      readonly label: string
    }

/**
 * 新しい行（前に見た位置より後ろ）のうち、描かれた最初のものの手前に線を差し込む。1つも描かれていなければ出さない。
 * 文の時間と済んだフェーズの数（ワークプランの札の数）は、新しい行から数える。
 */
export function awaySeamOf(input: {
  readonly away: Away
  readonly rows: readonly ConversationStreamRow[]
  readonly items: readonly StreamItem[]
}): AwaySeam {
  const { away, rows, items } = input
  const added = rows.slice(away.rowCount)
  // 締めのセリフは記録より前に描くので、先頭の行ではなく描く位置が最も前のものを選ぶ。
  const drawn = added
    .map((row) => items.findIndex((item) => drawsRow(item, row)))
    .filter((index) => index >= 0)
  if (drawn.length === 0) {
    return { kind: "none" }
  }
  const before = Math.min(...drawn)
  const phaseCount = added.filter(
    (row) => row.kind === "step" && row.record.kind === "work-plan",
  ).length
  return { kind: "seam", before, label: labelOf(away.awayMs, phaseCount) }
}

/** 「離れていた 4分のあいだに、フェーズが2つ済んだ」。1分未満なら時間を、0なら済んだ数を添えない。 */
function labelOf(awayMs: number, phaseCount: number): string {
  const minutes = Math.floor(awayMs / MS_PER_MINUTE)
  const phases = `フェーズが${String(phaseCount)}つ済んだ`
  if (minutes >= 1 && phaseCount > 0) {
    return `離れていた ${String(minutes)}分のあいだに、${phases}`
  }
  if (minutes >= 1) {
    return `離れていた ${String(minutes)}分`
  }
  return phaseCount > 0 ? phases : ""
}

/** この描く1件が、流れの行1つを描いているか。畳みの中に入った行は畳みが描く。 */
function drawsRow(item: StreamItem, row: ConversationStreamRow): boolean {
  switch (row.kind) {
    case "post":
    case "say":
      return (
        isRowOf(item, row) ||
        (item.kind === "fold" && item.items.some((entry) => isRowOf(entry, row)))
      )
    case "failure":
      return item.kind === "failure"
    case "question":
      return (
        (item.kind === "question" && item.entry.toolUseId === row.record.toolUseId) ||
        (item.kind === "fold" &&
          item.items.some(
            (entry) => entry.kind === "question" && entry.entry.toolUseId === row.record.toolUseId,
          ))
      )
    case "report":
      return (
        (item.kind === "body" && isReportBodyOf(item.step, row.record.toolUseId)) ||
        (item.kind === "fold" &&
          item.items.some(
            (entry) => entry.kind === "body" && isReportBodyOf(entry.step, row.record.toolUseId),
          ))
      )
    case "step":
      return (
        item.kind === "fold" &&
        item.items.some((entry) => entry.kind === "plan" && entry.record === row.record)
      )
  }
}

/** 締めのセリフは行の写しなので、同じ行かどうかは記録で見る。 */
function isRowOf(
  item: StreamItem | ProgressItem,
  row: Extract<ConversationStreamRow, { readonly kind: "post" | "say" }>,
): boolean {
  return (item.kind === "post" || item.kind === "say") && item.record === row.record
}

function isReportBodyOf(step: MainViewStep, toolUseId: string): boolean {
  return step.origin.kind === "tool-report" && step.origin.toolUseId === toolUseId
}
