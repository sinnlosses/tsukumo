// 祝う動き（`celebrate`）のあいだだけ、立ち絵の頭のまわりに差し色の光を1回散らす。
// 立ち絵とは別の要素で、パックの素材には触れない。置き場は左の列の立ち絵の箱の中（CSS が切る）。

import type { CSSProperties, ReactElement } from "react"

import styles from "./character-view.module.css"

/** 光の粒が飛ぶ先（px）。出どころは箱の横の中央・下から40%で、横は箱の幅の半分に収まる。 */
const CELEBRATE_SPARKS = [
  { x: -101, y: -30 },
  { x: -84, y: -92 },
  { x: -46, y: -132 },
  { x: -6, y: -150 },
  { x: 34, y: -136 },
  { x: 74, y: -98 },
  { x: 94, y: -36 },
  { x: 54, y: -124 },
] as const satisfies readonly { readonly x: number; readonly y: number }[]

export function CelebrateSpark(): ReactElement {
  return (
    <span className={styles["celebrate-spark"]} data-celebrate-spark="" aria-hidden="true">
      {CELEBRATE_SPARKS.map(({ x, y }) => {
        const style: CSSProperties = { "--spark-x": `${x}px`, "--spark-y": `${y}px` }
        return <i key={`${x},${y}`} style={style} />
      })}
    </span>
  )
}
