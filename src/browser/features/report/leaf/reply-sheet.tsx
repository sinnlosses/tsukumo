// 狭い幅で、余白の札のかわりに画面の下から出すシート。本文を押し下げない。
// 本文の容器（`container-type`）の中では fixed の基準が容器になるので、`document.body` へ出す。

import type { KeyboardEvent, ReactElement, ReactNode } from "react"
import { createPortal } from "react-dom"

import { Button } from "../../../components/ui/button/button.tsx"
import styles from "./leaf.module.css"

export function ReplySheet(props: {
  readonly onClose: () => void
  readonly children: ReactNode
}): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      props.onClose()
    }
  }
  return createPortal(
    <div
      role="dialog"
      aria-label="聞く・頼む"
      className={styles["reply-sheet"]}
      data-reply-sheet=""
      data-reply-keep=""
      onKeyDown={onKeyDown}
    >
      <div className={styles["reply-sheet-head"]}>
        <Button
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["reply-sheet-close"]}
          onClick={props.onClose}
        >
          閉じる
        </Button>
      </div>
      <div className={styles["reply-sheet-body"]}>{props.children}</div>
    </div>,
    document.body,
  )
}
