// 雑談のあらすじを写しに書くとき、上限に収めるために古い行を落としたこと（`synopsis-trim`）の足跡の形。
// 時刻と落とした行数だけを持つ。あらすじの文もパックの名前も持たない。

import { z } from "zod"

export const synopsisTrimFootprintSchema = z.object({
  flow: z.literal("synopsis-trim"),
  /** 書き終えた時刻（エポックミリ秒）。 */
  at: z.number(),
  /** 落とした行数（1以上のときだけ書く）。 */
  droppedLines: z.number(),
})

/** あらすじの古い行を上限のために落としたこと。 */
export type SynopsisTrimFootprint = Readonly<z.infer<typeof synopsisTrimFootprintSchema>>
