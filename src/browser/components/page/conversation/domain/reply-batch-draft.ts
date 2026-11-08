// 溜めた「頼む」の付箋を、1つの依頼の下書きの文面にする。
// 付箋の中身は利用者の書いた字なので、ここでも外へ出さない。

import type { MainViewTurn } from "../../../../../shared/session/main-view-shape.ts"
import type { ReplyTarget } from "../../../../../shared/session/reply-target.ts"
import type { ReplyNote } from "../../../../stores/reply-note-list.ts"
import { outlineReportOf } from "./outline-report-row.ts"

/** `reportToolUseId` からレポートの見出しを引く。引けなければ空の字。 */
export type ReportTitleOf = (reportToolUseId: string) => string

const NOTE_INDENT = "   "

/**
 * レポートを出したステップの `toolUseId` から、そのやり取りのレポートの行の題を引く関数。
 * 題の無いやり取り・見つからない `toolUseId` は空の字。
 */
export function reportTitleLookup(turns: readonly MainViewTurn[]): ReportTitleOf {
  const titles = new Map<string, string>()
  for (const turn of turns) {
    const outline = outlineReportOf(turn)
    if (outline.kind !== "report") continue
    for (const step of turn.steps) {
      if (step.origin.kind === "tool-report") {
        titles.set(step.origin.toolUseId, outline.title)
      }
    }
  }
  return (reportToolUseId) => titles.get(reportToolUseId) ?? ""
}

/**
 * 並び済みの未送信の付箋から、まとめて頼む下書きの文面を組む。
 * 別のレポートの付箋が混じるときは、1行目から見出しを外し、指した所の頭へ見出しを足す。
 */
export function replyBatchDraftOf(notes: readonly ReplyNote[], titleOf: ReportTitleOf): string {
  const reportIds = new Set(notes.map((note) => note.target.key.reportToolUseId))
  const mixed = reportIds.size > 1
  const title = mixed ? "" : titleOf(notes[0]?.target.key.reportToolUseId ?? "")
  const head =
    title === ""
      ? `レポートへの頼みごと ${String(notes.length)} 件。この順に進めて。`
      : `レポート「${title}」への頼みごと ${String(notes.length)} 件。この順に進めて。`
  const items = notes.map((note, index) => {
    const place = placeOf(note.target, mixed ? titleOf(note.target.key.reportToolUseId) : "")
    const body = note.body
      .split("\n")
      .map((line) => `${NOTE_INDENT}${line}`)
      .join("\n")
    return `${String(index + 1)}. ${place}\n${body}`
  })
  return [head, "", ...items].join("\n")
}

/** 指した所の字。`section › component › row` から、無い欄を飛ばしてつなぐ。 */
export function replyPlaceOf(target: ReplyTarget): string {
  const { section, component, row } = target.label
  return [section, component, row].filter((part) => part !== undefined).join(" › ")
}

function placeOf(target: ReplyTarget, reportTitle: string): string {
  return reportTitle === "" ? replyPlaceOf(target) : `${reportTitle} › ${replyPlaceOf(target)}`
}
