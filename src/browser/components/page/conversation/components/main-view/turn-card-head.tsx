// 札の頭。進み具合のプログレスバーを、転がっても札の右の側の上端に残す。

import type { ReactElement, ReactNode } from "react"

import { useTurnCardHeadHeight } from "./hooks/use-turn-card-head-height.ts"
import styles from "./main-view.module.css"

export function TurnCardHead(props: { readonly children: ReactNode }): ReactElement {
  const headRef = useTurnCardHeadHeight()
  return (
    <div className={styles["turn-card-head"]} ref={headRef}>
      {props.children}
    </div>
  )
}
