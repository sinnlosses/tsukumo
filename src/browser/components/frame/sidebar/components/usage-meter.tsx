// 下端の帯の使用量1つ分。語・割合・細い棒の形で、コンテキスト・5時間・7日が同じ部品を使う。
// 押すと詳しい面が開く。棒の縦の線は自動圧縮が始まる位置（コンテキストだけ）。
// 警告の境目を超えたら割合と棒を `--state-warn` にする。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { UsageMeterView } from "../hooks/use-sidebar-footer.ts"
import styles from "./usage-meter.module.css"

export function UsageMeter(props: {
  readonly meter: UsageMeterView
  readonly open: boolean
  readonly detailId: string
  readonly onToggle: () => void
}): ReactElement {
  const { meter } = props

  return (
    <button
      type="button"
      className={clsx(styles["usage-meter"], meter.warn && styles["is-warn"])}
      aria-label={meter.ariaLabel}
      aria-expanded={props.open}
      aria-controls={props.detailId}
      aria-busy={meter.busy ? "true" : undefined}
      data-finished-turn-count={
        meter.source.kind === "after" ? String(meter.source.finishedTurnCount) : undefined
      }
      title={meter.word}
      onClick={props.onToggle}
    >
      <span className={styles["usage-meter-word"]}>{meter.word}</span>
      <span className={styles["usage-meter-value"]}>{meter.percentageText}</span>
      <span className={styles["usage-meter-track"]} aria-hidden="true">
        <span
          className={styles["usage-meter-fill"]}
          style={{ width: `${String(meter.fillWidth)}%` }}
        />
        {meter.compact.kind === "at" && (
          <span
            className={styles["usage-meter-compact"]}
            style={{ left: `${String(meter.compact.position)}%` }}
          />
        )}
      </span>
    </button>
  )
}
