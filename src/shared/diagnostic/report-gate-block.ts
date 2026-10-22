// `report` の関所（`ReportGate`）が止まろうとしたターンを止めたこと（`report-gate-block`）の足跡の形。
// 時刻だけを持つ。差し戻しの理由文も本文も持たない。

import { z } from "zod"

export const reportGateBlockFootprintSchema = z.object({
  flow: z.literal("report-gate-block"),
  /** 止めた時刻（エポックミリ秒）。 */
  at: z.number(),
})

/** `report` の関所が `Stop` を1回止めたこと。 */
export type ReportGateBlockFootprint = Readonly<z.infer<typeof reportGateBlockFootprintSchema>>
