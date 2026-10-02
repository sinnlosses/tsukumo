// 札の頭。題の行と進み具合の帯をまとめて、転がっても上に残す。

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
