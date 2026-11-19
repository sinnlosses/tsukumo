// サイドバーの下端の帯。コンテキスト・5時間・7日の3つを、帯の幅いっぱいの3区画に並べる。
// 3つはどれもボタンで、押すと帯の上に詳しい面（いまのコンテキストのカードとプラン使用量のカード）が開く。

import type { ReactElement } from "react"

import { Surface } from "../../../ui/surface/surface.tsx"
import type { SidebarFooterView } from "../hooks/use-sidebar-footer.ts"
import { ContextUsageRow } from "./context-usage-row.tsx"
import { PlanUsageRow } from "./plan-usage-row.tsx"
import styles from "./sidebar-footer.module.css"
import { UsageMeter } from "./usage-meter.tsx"

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
      <div className={styles["sidebar-footer-usage"]}>
        <UsageMeter meter={contextGauge} open={open} detailId={detailId} onToggle={onToggle} />
        <UsageMeter
          meter={planGauge.fiveHour}
          open={open}
          detailId={detailId}
          onToggle={onToggle}
        />
        <UsageMeter
          meter={planGauge.sevenDay}
          open={open}
          detailId={detailId}
          onToggle={onToggle}
        />
      </div>
      {open && (
        <Surface
          element="div"
          tone="ground"
          space="none"
          radius="lg"
          shadow="none"
          className={styles["sidebar-footer-detail"]}
        >
          <div
            id={detailId}
            className={styles["sidebar-footer-detail-body"]}
            role="region"
            aria-label={DETAIL_LABEL}
          >
            <ContextUsageRow usage={contextUsage} />
            <PlanUsageRow planUsage={planUsage} />
          </div>
        </Surface>
      )}
    </div>
  )
}
