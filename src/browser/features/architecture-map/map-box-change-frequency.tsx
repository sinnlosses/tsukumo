// 説明の枠で、選んだ箱の直近 30 日の commits の数と最終更新の日を出す。

import type { ReactElement } from "react"

import type { MapViewBox } from "../../../shared/architecture-map/map-view.ts"
import styles from "./map-box-change-frequency.module.css"

const GROUPED = new Intl.NumberFormat("en-US")

export function MapBoxChangeFrequency(props: {
  readonly changeFrequency: NonNullable<MapViewBox["changeFrequency"]>
}): ReactElement {
  const { changeFrequency } = props
  return (
    <div className={styles["section"]}>
      <span className={styles["label"]}>変更頻度（30日）</span>
      <ul className={styles["rows"]}>
        <li className={styles["row"]}>
          <span>commits</span>
          <span>{`${GROUPED.format(changeFrequency.commitCount)}件`}</span>
        </li>
        {changeFrequency.lastChangedOn !== undefined && (
          <li className={styles["row"]}>
            <span>最終更新</span>
            <span>{changeFrequency.lastChangedOn}</span>
          </li>
        )}
      </ul>
    </div>
  )
}
