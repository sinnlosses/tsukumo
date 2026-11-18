// 面の部品が読む紙全体の値と、その値から節・内容部品の並びを引く手。

import type { ReactComponentImplementation } from "@a2ui/react/v0_9"
import type { SurfaceModel } from "@a2ui/web_core/v0_9"
import { createContext, use } from "react"

import type { A2uiReportComponent } from "../../../shared/report/a2ui-report-catalog.ts"
import { A2UI_ROOT_ID } from "../../../shared/report/a2ui-report-outline.ts"
import { sectionHeadingMarkdown } from "../../../shared/report/drawn-entry-markdown.ts"
import type { A2uiReportProps } from "./a2ui-surface-model.ts"
import type { useReevaluatedLeaves } from "./leaf/parameter-knob.tsx"

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

/**
 * 並びの枠1つ。`part` は届いた部品。
 * `pending` は、草稿で次に届く見込みの部品の場所に置く骨組み。紙に置く骨組みはこの1つだけ。
 */
export type RunSlot = { readonly kind: "part"; readonly id: string } | { readonly kind: "pending" }

/**
 * ID の並びを描く順の枠にする。入れ子の `Section` は中の子を同じ並びに開く。
 * まだ届いていない ID は、次に届く見込みの1つだけを骨組みの枠にする。
 */
export function runSlots(ids: readonly string[], report: ReportContextValue): readonly RunSlot[] {
  return ids.flatMap((id): readonly RunSlot[] => {
    const part = report.parts.get(id)
    if (part === undefined) {
      return isNextPending(report, id) ? [{ kind: "pending" }] : []
    }
    return part.component === "Section" ? runSlots(part.children, report) : [{ kind: "part", id }]
  })
}

/** 本文の節の枠1つ。`drawn` は欄になった根の子、`pending` は草稿でまだ欄にならない根の子。 */
export type SectionSlot =
  | { readonly kind: "drawn"; readonly componentId: string; readonly regionId: number }
  | { readonly kind: "pending"; readonly componentId: string }

/**
 * 本文の節の枠を紙の順に並べる。
 * 草稿でまだ欄にならない根の子は、根の子の順の位置に挟む。
 * 挟むのは、届いていて子孫を待っているもの（`Section` は見出しを先に出す）と、次に届く見込みのもの（骨組みを置く）だけ。
 */
export function sectionSlots(report: ReportContextValue): readonly SectionSlot[] {
  const { sections } = report.view
  const open = report.pending?.openSections ?? []
  const root = report.parts.get(A2UI_ROOT_ID)
  if (open.length === 0 || root?.component !== "Report") {
    return Object.entries(sections)
      .toSorted(([, left], [, right]) => left.regionId - right.regionId)
      .map(([componentId, section]) => ({
        kind: "drawn",
        componentId,
        regionId: section.regionId,
      }))
  }
  return root.children.flatMap((componentId): readonly SectionSlot[] => {
    const section = sections[componentId]
    if (section !== undefined) {
      return [{ kind: "drawn", componentId, regionId: section.regionId }]
    }
    const waiting = open.includes(componentId) && report.parts.has(componentId)
    return waiting || isNextPending(report, componentId) ? [{ kind: "pending", componentId }] : []
  })
}

/**
 * 節の見出しの行（`## …`）と字。見出しが無ければどちらも空文字。
 * 欄になった節は欄の値から引く。草稿でまだ欄にならない `Section` は、届いた部品の `heading` から引く。
 */
export function sectionHeadingOf(
  report: ReportContextValue,
  id: string,
): { readonly line: string; readonly text: string } {
  const section = report.view.sections[id]
  if (section !== undefined) {
    const text = report.body.sections.find((entry) => entry.id === section.regionId)?.heading ?? ""
    return { line: section.heading, text }
  }
  const part = report.parts.get(id)
  const pending = report.pending?.openSections.includes(id) === true
  const text = pending && part?.component === "Section" ? part.heading.trim() : ""
  return { line: sectionHeadingMarkdown(text), text }
}

/** 草稿で次に届く見込みの部品か。骨組みを置くのは、この部品の場所だけ。 */
function isNextPending(report: ReportContextValue, id: string): boolean {
  return report.pending?.next === id
}
