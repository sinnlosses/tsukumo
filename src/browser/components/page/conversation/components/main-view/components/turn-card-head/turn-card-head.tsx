// 札の頭。進み具合の帯を、転がっても札の右の側の上端に残す。

import { useRef, type ReactElement, type ReactNode, type RefObject } from "react"

import { useTurnCardHeadHeight } from "./hooks/use-turn-card-head-height.ts"
import styles from "./turn-card-head.module.css"

export function TurnCardHead(props: {
  readonly rootRef: RefObject<HTMLElement | null>
  readonly children: ReactNode
}): ReactElement {
  const headRef = useRef<HTMLDivElement>(null)
  useTurnCardHeadHeight(headRef, props.rootRef)
  return (
    <div className={styles["turn-card-head"]} ref={headRef}>
      {props.children}
    </div>
  )
}
