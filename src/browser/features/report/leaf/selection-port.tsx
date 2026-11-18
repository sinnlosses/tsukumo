// レポートの本文で選んだ字の横に出す「引いて聞く」。
// 押すと、選んだ字を引用にして入力欄の頭に入れ、入力欄へフォーカスを送る。押した瞬間（mousedown）には選択を外さない。
// 口が渡されていない描画（入力欄の無い画面）では出さない。

import { type ReactElement, type RefObject, use } from "react"
import { createPortal } from "react-dom"

import { Button } from "../../../components/ui/button/button.tsx"
import { useSelectionPoint } from "../hooks/use-selection-point.ts"
import { ReplyPortContext } from "../reply-port.ts"
import styles from "./leaf.module.css"

export function SelectionPort(props: {
  /** レポートの本文の根（`data-report-body`）。この中で選んだ字だけを拾う。 */
  readonly rootRef: RefObject<HTMLElement | null>
}): ReactElement | undefined {
  const slot = use(ReplyPortContext)
  const { point, dismiss } = useSelectionPoint(props.rootRef)
  if (slot.kind === "none" || point.kind === "none") {
    return undefined
  }
  return createPortal(
    <div
      className={styles["selection-port"]}
      style={{ top: point.top, left: point.right }}
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
        className={styles["selection-port-button"]}
        onClick={() => {
          slot.port.prependDraft(point.quote)
          dismiss()
        }}
      >
        引いて聞く
      </Button>
    </div>,
    document.body,
  )
}
