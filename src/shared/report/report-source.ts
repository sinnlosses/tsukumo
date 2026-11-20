// レポートが本文の印 `{{cite: …}}` で指す外の出典1件の形（根の `Report` の `sources` の要素）。

import { z } from "zod"

import { SOURCE_ID_PATTERN } from "./inline-mark.ts"
import { MAX_SOURCE_TITLE } from "./report-limit.ts"

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"])

export const reportSourceSchema = z.object({
  id: z.string().regex(SOURCE_ID_PATTERN),
  title: z
    .string()
    .min(1)
    .max(MAX_SOURCE_TITLE)
    .regex(/^[^\n\r]*$/),
  url: z.string().refine(isWebUrl),
})

export type ReportSource = z.infer<typeof reportSourceSchema>

function isWebUrl(text: string): boolean {
  return URL.canParse(text) && WEB_PROTOCOLS.has(new URL(text).protocol)
}
