// 面の部品が読む紙全体の値と、その値から内容部品の並びを引く手。

import type { ReactComponentImplementation } from "@a2ui/react/v0_9"
import type { SurfaceModel } from "@a2ui/web_core/v0_9"
import { createContext, use } from "react"

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import type { ReplyNote } from "../../stores/reply-note-list.ts"
import type { A2uiReportProps } from "./a2ui-surface-model.ts"
import { type AskThreadSlot, sectionAskCount } from "./ask-thread-context.ts"
import type { useReevaluatedLeaves } from "./leaf/parameter-knob.tsx"
import type { ReplyPortSlot } from "./reply-port.ts"

export type ReportContextValue = A2uiReportProps & {
  readonly parts: ReadonlyMap<string, A2uiReportComponent>
  readonly dataModel: SurfaceModel<ReactComponentImplementation>["dataModel"]
  readonly leaves: ReturnType<typeof useReevaluatedLeaves>
}

export const ReportContext = createContext<ReportContextValue | undefined>(undefined)

export function useReport(): ReportContextValue {
  const value = use(ReportContext)
  if (value === undefined) {
    throw new Error("A2UI の面の部品が A2uiReport の外で描かれた")
  }
  return value
}

export function askCountOf(
  report: ReportContextValue,
  threads: AskThreadSlot,
  sectionId: string,
): number {
  if (report.reportToolUseId === undefined) {
    return 0
  }
  const part = report.parts.get(sectionId)
  const ids = part?.component === "Section" ? part.children : [sectionId]
  return sectionAskCount(threads, report.reportToolUseId, runIds(ids, report))
}

/** 節の中の内容部品に付いた未送信の付箋の数。口が無い描画は付箋を読まない。 */
export function noteCountOf(
  report: ReportContextValue,
  port: ReplyPortSlot,
  notes: readonly ReplyNote[],
  sectionId: string,
): number {
  if (port.kind === "none" || report.reportToolUseId === undefined) {
    return 0
  }
  const part = report.parts.get(sectionId)
  const ids = runIds(part?.component === "Section" ? part.children : [sectionId], report)
  return notes.filter(
    (note) =>
      note.state.kind === "unsent" &&
      note.target.key.reportToolUseId === report.reportToolUseId &&
      ids.includes(note.target.key.componentId),
  ).length
}

export function runIds(ids: readonly string[], report: ReportContextValue): readonly string[] {
  return ids.flatMap((id): readonly string[] => {
    const part = report.parts.get(id)
    if (part === undefined) {
      return []
    }
    return part.component === "Section" ? runIds(part.children, report) : [id]
  })
}
