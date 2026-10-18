// 体験の記録へ、ブラウザで起きたことを書く手続きの契約。
// 運ぶのは仕切りの名前（固定の3語）と比率の数だけで、自由な文字列の口は無い。

import { oc } from "@orpc/contract"
import { z } from "zod"

import { SPLIT_DIVIDERS } from "../experience-metric/experience-metric-record.ts"

const splitReleaseSchema = z.object({
  divider: z.enum(SPLIT_DIVIDERS),
  releasedPercent: z.number().min(0).max(100),
  previousPercent: z.number().min(0).max(100),
})

export const experienceMetricContract = {
  /** 会話の画面の仕切りを離した1回。セッションが繋がるまでは書かずに捨てる。 */
  recordSplit: oc.input(splitReleaseSchema),
}
