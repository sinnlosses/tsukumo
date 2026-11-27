// 説明の枠でパスの下に並べる、ファイル数と子モジュール数の札。どちらも出さないときは何も描かない。

import type { ReactElement } from "react"

import styles from "./map-box-count.module.css"

const GROUPED = new Intl.NumberFormat("en-US")

export function MapBoxCounts(props: {
  readonly fileCount?: number
  readonly childCount?: number
}): ReactElement | undefined {
  const { fileCount, childCount } = props
  const showsChildren = childCount !== undefined && childCount >= 1
  if (fileCount === undefined && !showsChildren) {
    return undefined
  }
  return (
    <div className={styles["counts"]}>
      {fileCount !== undefined && (
        <span className={styles["chip"]}>
          <b className={styles["number"]}>{GROUPED.format(fileCount)}</b> files
        </span>
      )}
      {showsChildren && (
        <span className={styles["chip"]}>
          子モジュール <b className={styles["number"]}>{GROUPED.format(childCount)}</b>
        </span>
      )}
    </div>
  )
}
