// 「いつもは」の所要の読み取りの契約。

import { oc } from "@orpc/contract"

import { usualDurationsSchema } from "../usage/usual-duration.ts"

export const usualDurationContract = {
  /** 段の群ごと・待ちの種類ごとの、件数と中央値と幅（直近の記録から）。 */
  usualDurations: oc.output(usualDurationsSchema),
}
