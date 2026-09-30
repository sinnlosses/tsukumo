// サイドバーの下端の帯。1行に、左からモデル・effort・許可モードの操作子（`RunSettingGroup`）、コンテキストの目盛り、利用枠の2つの円を並べる。
// 目盛りと円はどちらも押せる口で、押すと帯の上に詳しい面（いまのコンテキストの札と利用枠の札）が開く。

import type { ReactElement } from "react"

import type { SidebarFooterView } from "../hooks/use-sidebar-footer.ts"
import { ContextUsageGauge } from "./context-usage-gauge.tsx"
import { ContextUsageRow } from "./context-usage-row.tsx"
import { PlanUsageGauge } from "./plan-usage-gauge.tsx"
import { PlanUsageRow } from "./plan-usage-row.tsx"
import { RunSettingGroup } from "./run-setting-group.tsx"
import styles from "./sidebar-footer.module.css"

const DETAIL_LABEL = "使用量の詳しい面"

/** props はここだけ分解して受ける（`ref` を `props.ref` の形で描画中に読むと `react(refs)` が落ちるため）。 */
export function PresentationalSidebarFooter({
  ref,
  open,
  detailId,
  onToggle,
  contextUsage,
  planUsage,
  contextGauge,
  planGauge,
}: SidebarFooterView): ReactElement {
  return (
    <div className={styles["sidebar-footer"]} ref={ref}>
      <RunSettingGroup />
      {/* 目盛りと円はひとまとまりで右へ寄せる（サイドバーが狭くて折り返すときも、2つが離れずに次の行の右端へ移る）。 */}
      <div className={styles["sidebar-footer-usage"]}>
        <ContextUsageGauge
          gauge={contextGauge}
          open={open}
          detailId={detailId}
          onToggle={onToggle}
        />
        <span className={styles["sidebar-footer-divider"]} aria-hidden="true" />
        <PlanUsageGauge gauge={planGauge} open={open} detailId={detailId} onToggle={onToggle} />
      </div>
      {open && (
        <div
          id={detailId}
          className={styles["sidebar-footer-detail"]}
          role="region"
          aria-label={DETAIL_LABEL}
        >
          <ContextUsageRow usage={contextUsage} />
          <PlanUsageRow planUsage={planUsage} />
        </div>
      )}
    </div>
  )
}
