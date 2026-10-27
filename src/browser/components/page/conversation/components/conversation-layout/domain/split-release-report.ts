// 仕切りを離したことを体験の記録へ送る。送れなくても諦める（再送しない）。

import type { SplitDivider } from "../../../../../../../shared/usage/experience-metric-record.ts"
import { useSession } from "../../../../../../stores/session.ts"

export function reportSplitRelease(
  divider: SplitDivider,
  releasedPercent: number,
  previousPercent: number,
): void {
  void useSession
    .getState()
    .dispatch.experienceMetric.recordSplit({ divider, releasedPercent, previousPercent })
}
