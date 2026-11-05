// 枠1つぶんの円と割合。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { PlanWindowPieView } from "../hooks/use-sidebar-footer.ts"
import sidebarStyles from "../sidebar.module.css"
import styles from "./plan-window-pie.module.css"

export function PlanWindowPie(props: { readonly pie: PlanWindowPieView }): ReactElement {
  const { pie } = props
  return (
    <span
      className={clsx(sidebarStyles["plan-gauge-window"], pie.warn && sidebarStyles["is-warn"])}
    >
      <svg
        className={styles["plan-gauge-pie"]}
        width="22"
        height="22"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <circle className={styles["plan-gauge-pie-track"]} cx="10" cy="10" r="9" />
        {pie.slice.kind === "path" && (
          <path className={sidebarStyles["plan-gauge-pie-fill"]} d={pie.slice.d} />
        )}
        <circle className={styles["plan-gauge-pie-hub"]} cx="10" cy="10" r="1.3" />
      </svg>
      <span className={styles["plan-gauge-figure"]}>
        <span className={sidebarStyles["usage-gauge-label"]}>{pie.label}</span>
        <span className={sidebarStyles["usage-gauge-value"]}>{pie.percentageText}</span>
      </span>
    </span>
  )
}
