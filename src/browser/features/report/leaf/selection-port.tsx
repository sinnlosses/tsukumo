// 指せる単位の外（頭の欄・図・配置の部品）で選んだ字の横に出す「聞く・頼む」。
// 押すか ⌘⌥M で、選んだ字を引用にして入力欄の頭に入れ、入力欄へフォーカスを送る。押した瞬間（mousedown）には選択を外さない。

import { type ReactElement, use } from "react"
import { createPortal } from "react-dom"

import { Button } from "../../../components/ui/button/button.tsx"
import { useEventListener } from "../../../hooks/use-event-listener.ts"
import { isOpenShortcut } from "../domain/reply-unit.ts"
import type { SelectionOutside } from "../hooks/use-selection-point.ts"
import { ReplyPortContext } from "../reply-port.ts"
import styles from "./leaf.module.css"

export function SelectionPort(props: {
  readonly shown: Extract<SelectionOutside, { readonly kind: "shown" }>
  readonly onDone: () => void
}): ReactElement | undefined {
  const slot = use(ReplyPortContext)
  const quote = () => {
    if (slot.kind === "open") {
      slot.port.prependDraft(props.shown.quote)
    }
    props.onDone()
  }
  useEventListener(document, "keydown", (event) => {
    if (isOpenShortcut(event)) {
      event.preventDefault()
      quote()
    }
  })
  if (slot.kind === "none") {
    return undefined
  }
  return createPortal(
    <div
      className={styles["selection-port"]}
      style={{
        top: props.shown.top,
        left: props.shown.left,
        translate: props.shown.align === "end" ? "-100% 0" : undefined,
      }}
      data-reply-keep=""
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
        onClick={quote}
      >
        聞く・頼む
      </Button>
    </div>,
    document.body,
  )
}
