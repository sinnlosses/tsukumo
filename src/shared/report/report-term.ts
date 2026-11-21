// レポートの用語の注1件の形（根の `Report` の `terms` の要素）。

import { z } from "zod"

import { MAX_TERM, MAX_TERM_NOTE } from "./report-limit.ts"

const SINGLE_LINE = /^[^\n\r]*$/

export const reportTermSchema = z.object({
  term: z.string().min(1).max(MAX_TERM).regex(SINGLE_LINE),
  note: z.string().min(1).max(MAX_TERM_NOTE).regex(SINGLE_LINE),
})

export type ReportTerm = z.infer<typeof reportTermSchema>
