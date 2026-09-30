// 「文脈 7%」と細い目盛り。目盛りの縦の線は自動圧縮が始まる位置。
// 70%以上は字と目盛りを `--state-warn` にする。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { ContextGauge } from "../hooks/use-sidebar-footer.ts"
import sidebarStyles from "../sidebar.module.css"
import styles from "./context-usage-gauge.module.css"

export function ContextUsageGauge(props: {
  readonly gauge: ContextGauge
  readonly open: boolean
  readonly detailId: string
  readonly onToggle: () => void
}): ReactElement {
  const { gauge } = props

  return (
    <button
      type="button"
      className={clsx(
        sidebarStyles["usage-gauge"],
        sidebarStyles["context-gauge"],
        gauge.warn && sidebarStyles["is-warn"],
      )}
      aria-label={gauge.label}
      aria-expanded={props.open}
      aria-controls={props.detailId}
      aria-busy={gauge.busy ? "true" : undefined}
      title="コンテキスト"
      onClick={props.onToggle}
    >
      <span className={styles["context-gauge-figure"]}>
        <span className={sidebarStyles["usage-gauge-label"]}>文脈</span>
        <span className={sidebarStyles["usage-gauge-value"]}>{gauge.percentageText}</span>
      </span>
      <span className={styles["context-gauge-track"]} aria-hidden="true">
        <span
          className={sidebarStyles["context-gauge-fill"]}
          style={{ width: `${String(gauge.fillWidth)}%` }}
        />
        {gauge.compact.kind === "at" && (
          <span
            className={styles["context-gauge-compact"]}
            style={{ left: `${String(gauge.compact.position)}%` }}
          />
        )}
      </span>
    </button>
  )
}
