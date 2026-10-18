// 前後の画像の「変わった場所」の枠。画像を包む箱の中に、画像に対する%の位置で飾りの枠を重ねる。
// 押せる要素ではなく、読み上げにも出さない。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { ImageRegion } from "../../../../../../../shared/report/report-image.ts"
import styles from "./region-frame.module.css"

export type RegionFrameSide = "before" | "after"

type RegionFramedProps = {
  readonly region: ImageRegion
  readonly side: RegionFrameSide
  readonly children: ReactNode
  readonly hostClassName: string | undefined
}

export function RegionFramed(props: RegionFramedProps): ReactElement {
  const { left, top, width, height } = props.region
  return (
    <span className={clsx(styles["region-frame-host"], props.hostClassName)}>
      {props.children}
      <span
        aria-hidden="true"
        className={styles["region-frame"]}
        data-side={props.side}
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
      />
    </span>
  )
}
