// 読み込み中の塊。中身は Astryx の `Skeleton`（明滅を持つ）で、読み上げには出さない。語彙を持たない。

import { Skeleton as AstryxSkeleton } from "@astryxdesign/core/Skeleton"
import type { CSSProperties, ReactElement, ReactNode } from "react"

export type SkeletonProps = {
  /** 色・寸法・明滅の遅れ（`animation-delay`）を渡す。 */
  readonly className: string
  readonly style?: CSSProperties
  /** Astryx の `Skeleton` は中身を持たない。字が入っているときは、その字の1行分の高さにする。 */
  readonly children: ReactNode
}

export function Skeleton(props: SkeletonProps): ReactElement {
  return (
    <AstryxSkeleton
      className={props.className}
      style={props.style}
      height={props.children === undefined ? undefined : "1lh"}
      aria-hidden="true"
    />
  )
}
