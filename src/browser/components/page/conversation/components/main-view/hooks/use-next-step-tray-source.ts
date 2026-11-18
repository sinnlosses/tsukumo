// 最新のやり取りの最終レポートの次の一手を、入力欄の頭の並びへ載せる。
// 描いている最終レポートが替わる・外れるときに、前の元を外す。

import type { NextStep } from "../../../../../../features/report/next-step.ts"
import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { useNextStepTray } from "../../../stores/next-step-tray.ts"

/** 札が1つも無いときは載せない。 */
export function useNextStepTraySource(reportKey: string, steps: readonly NextStep[]): void {
  useExternalSync(() => {
    if (steps.length === 0) {
      return undefined
    }
    useNextStepTray.getState().attach(reportKey, steps)
    return () => {
      useNextStepTray.getState().detach(reportKey)
    }
  }, [reportKey, steps])
}
