// レポートの本文で字を選び終えたとき、選択の下端の近くに出る小さな口「引いて聞く」。
// 押すと選んだ字を引用にして入力欄の頭に入れ、入力欄へフォーカスを送る。
// 押した瞬間（mousedown）には選択を外さない。

import type { ReactElement } from "react"
import { createPortal } from "react-dom"

import { Button } from "../../../../ui/button/button.tsx"
import { useSelectionAsk } from "./hooks/use-selection-ask.ts"
import styles from "./main-view.module.css"

const ASK_LABEL = "引いて聞く"
/** 口の幅と高さのおおよそ（窓の端へ収めるための余白）。 */
const ASK_WIDTH_PX = 88
const ASK_HEIGHT_PX = 14
const ASK_GAP_PX = 0
const WINDOW_MARGIN_PX = 8

export function SelectionAsk(): ReactElement | null {
  const { selection, onAsk } = useSelectionAsk()
  if (selection === undefined) {
    return null
  }
  const left = Math.max(
    WINDOW_MARGIN_PX,
    Math.min(selection.anchor.left, window.innerWidth - ASK_WIDTH_PX - WINDOW_MARGIN_PX),
  )
  const top = Math.min(
    selection.anchor.bottom + ASK_GAP_PX,
    window.innerHeight - ASK_HEIGHT_PX - WINDOW_MARGIN_PX,
  )
  return createPortal(
    <div
      className={styles["selection-ask"]}
      style={{ left, top }}
      data-selection-ask=""
      onMouseDown={(event) => {
        event.preventDefault()
      }}
    >
      <Button
        variant="outline-accent"
        size="label"
        pressed="none"
        disabled={false}
        disclosure={{ kind: "none" }}
        className={styles["selection-ask-button"]}
        onClick={onAsk}
      >
        {ASK_LABEL}
      </Button>
    </div>,
    document.body,
  )
}
