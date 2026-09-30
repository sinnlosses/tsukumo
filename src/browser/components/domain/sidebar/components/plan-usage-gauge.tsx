// 5時間枠と7日間枠を、塗った扇の円と割合で並べる。80%以上の枠は扇と字を `--state-warn` にする。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { PlanGauge } from "../hooks/use-sidebar-footer.ts"
import styles from "../sidebar.module.css"
import { PlanWindowPie } from "./plan-window-pie.tsx"

export function PlanUsageGauge(props: {
  readonly gauge: PlanGauge
  readonly open: boolean
  readonly detailId: string
  readonly onToggle: () => void
}): ReactElement {
  const { gauge } = props

  return (
    <button
      type="button"
      className={clsx(styles["usage-gauge"], styles["plan-gauge"])}
      aria-label={gauge.label}
      aria-expanded={props.open}
      aria-controls={props.detailId}
      aria-busy={gauge.busy ? "true" : undefined}
      title="利用枠"
      onClick={props.onToggle}
    >
      <PlanWindowPie pie={gauge.fiveHour} />
      <PlanWindowPie pie={gauge.sevenDay} />
    </button>
  )
}
