// 狭い画面の引き出しの「使用量」のタブの中身。
// サイドバーの下端の帯の詳しい面と同じ2枚の札（いまのコンテキスト・利用枠）を、重ねて開く面にせず縦に並べる。
// 取り方は下端の帯と同じ（`useSidebarFooter`）なので、同じ合図で同じ cache に相乗りする。

import type { ReactElement } from "react"

import { useContextUsage } from "../../../../domain/context-usage.ts"
import { useSession } from "../../../../stores/session.ts"
import { usePlanUsage } from "../hooks/use-plan-usage.ts"
import { ContextUsageRow } from "./context-usage-row.tsx"
import { PlanUsageRow } from "./plan-usage-row.tsx"
import styles from "./usage-pane.module.css"

export function UsagePane(): ReactElement {
  const finishedTurnCount = useSession((session) => session.state.finishedTurnCount)
  const contextUsage = useContextUsage(finishedTurnCount)
  const planUsage = usePlanUsage(finishedTurnCount)
  return (
    <div className={styles["usage-pane"]}>
      <ContextUsageRow usage={contextUsage} />
      <PlanUsageRow planUsage={planUsage} />
    </div>
  )
}
