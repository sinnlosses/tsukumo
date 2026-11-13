// `report` の Report の根に置く、判定・次の手・置いた前提・出どころ・前回との対応・案内の付箋の欄の形と、読み替えたあとの形。
// 数の上限は zod で差し戻させず、読み替える側で丸める。

import { z } from "zod"

export const REPORT_JUDGMENTS = ["done", "partial", "yours", "stopped", "failed"] as const

const REPORT_NEXT_OWNERS = ["you", "writer", "none"] as const

export const reportJudgmentSchema = z.enum(REPORT_JUDGMENTS)

export const reportNextSchema = z.object({
  owner: z.enum(REPORT_NEXT_OWNERS),
  action: z.string(),
  choices: z.array(z.string()).optional(),
})

export const reportAssumptionsSchema = z.array(z.string())

export const reportSourceEntrySchema = z.object({
  mark: z.number().int().min(1),
  place: z.string(),
  note: z.string().optional(),
})

export const reportPreviousSchema = z.object({
  resolved: z.array(z.string()),
  added: z.array(z.string()),
  remaining: z.array(z.string()),
})

export const reportGuideNoteSchema = z.object({ target: z.string(), text: z.string() })

export type ReportJudgment = (typeof REPORT_JUDGMENTS)[number]

export type ReportNext = {
  readonly owner: (typeof REPORT_NEXT_OWNERS)[number]
  readonly action: string
  /** 読み替えで先頭3つへ丸めたもの。書かなかったら空の配列。 */
  readonly choices: readonly string[]
}

export type ReportSourceEntry = {
  readonly mark: number
  readonly place: string
  readonly note?: string
}

export type ReportPrevious = {
  readonly resolved: readonly string[]
  readonly added: readonly string[]
  readonly remaining: readonly string[]
}

export type ReportGuideNote = { readonly target: string; readonly text: string }

/**
 * 古い欄（`task.outcome`・`favor`・`workPlanClosing`）を読み替えたあとの、判定・次の手・置いた前提・出どころ・前回との対応・案内の付箋。
 * `verdictWritten` は書き手が `verdict` を書いたか（書かなければ `verdict` は古い欄からの読み替えか既定の `done`）。
 * `closingConflict` は `verdict` と `workPlanClosing` を両方書き、閉じ方が食い違っている。
 * `next`・`previous` の「無い」は `none`、ほかの「無い」は空の配列。
 */
export type ReportProgress = {
  readonly verdict: ReportJudgment
  readonly verdictWritten: boolean
  readonly closingConflict: boolean
  readonly next: { readonly kind: "none" } | ({ readonly kind: "next" } & ReportNext)
  readonly assumptions: readonly string[]
  readonly sources: readonly ReportSourceEntry[]
  readonly previous: { readonly kind: "none" } | ({ readonly kind: "previous" } & ReportPrevious)
  readonly guideNotes: readonly ReportGuideNote[]
}

/** 判定・次の手などの欄をどれも書かず、古い欄も無い読み。 */
export const NO_REPORT_PROGRESS = {
  verdict: "done",
  verdictWritten: false,
  closingConflict: false,
  next: { kind: "none" },
  assumptions: [],
  sources: [],
  previous: { kind: "none" },
  guideNotes: [],
} as const satisfies ReportProgress

export const REPORT_PROGRESS_KEYS = [
  "verdict",
  "verdictWritten",
  "closingConflict",
  "next",
  "assumptions",
  "sources",
  "previous",
  "guideNotes",
] as const satisfies readonly (keyof ReportProgress)[]
