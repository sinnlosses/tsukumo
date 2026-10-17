// 仕切りを離したことを体験の記録へ送る。送れなくても諦める（再送しない）。

import type { SplitDivider } from "../../../../../../../shared/experience-metric/experience-metric-record.ts"
import { rpc } from "../../../../../../domain/rpc.ts"

export function reportSplitRelease(
  divider: SplitDivider,
  releasedPercent: number,
  previousPercent: number,
): void {
  rpc.experienceMetric.recordSplit
    .call({ divider, releasedPercent, previousPercent })
    .catch(() => {})
}
