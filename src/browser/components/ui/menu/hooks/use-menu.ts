// 操作の一覧の開閉と、開いた面の中のキーボード。
// 押せる行は DOM の `[role="menuitem"]` から `aria-disabled` の無いものを拾い、行の並びを state に持たない。

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"

import { useDismissSignal, type DismissCause } from "../../../../hooks/use-dismiss-signal.ts"

type MenuState = {
  readonly open: boolean
  readonly rootRef: RefObject<HTMLDivElement | null>
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly panelRef: RefObject<HTMLDivElement | null>
  readonly onToggle: () => void
  /** 閉じて押す口へフォーカスを戻してから `onSelect` を呼ぶ（`onSelect` が行ごと部品を外してもよい）。 */
  readonly select: (onSelect: () => void) => void
  readonly onPanelKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

const ENABLED_ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])'

export function useMenu(): MenuState {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const panel = panelRef.current
    if (panel === null) {
      return
    }
    // 押せる行が1つも無いときは面そのものに置き、Esc と ↑↓ を面の `keydown` で受けられるようにする。
    const target = panel.querySelector<HTMLElement>(ENABLED_ITEM_SELECTOR) ?? panel
    target.focus()
  }, [open])

  function closeToTrigger(): void {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onDismiss(cause: DismissCause): void {
    if (cause === "escape") {
      closeToTrigger()
      return
    }
    setOpen(false)
  }

  useDismissSignal({ open, rootRef, onDismiss })

  function onToggle(): void {
    setOpen((wasOpen) => !wasOpen)
  }

  function select(onSelect: () => void): void {
    closeToTrigger()
    onSelect()
  }

  function focusAt(pick: (items: readonly HTMLElement[], current: number) => number): void {
    const panel = panelRef.current
    if (panel === null) {
      return
    }
    const items = [...panel.querySelectorAll<HTMLElement>(ENABLED_ITEM_SELECTOR)]
    if (items.length === 0) {
      return
    }
    const current = items.findIndex((item) => item === document.activeElement)
    items[pick(items, current)]?.focus()
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        focusAt((items, current) => (current + 1) % items.length)
        return
      case "ArrowUp":
        event.preventDefault()
        focusAt((items, current) => (current <= 0 ? items.length - 1 : current - 1))
        return
      case "Home":
        event.preventDefault()
        focusAt(() => 0)
        return
      case "End":
        event.preventDefault()
        focusAt((items) => items.length - 1)
        return
      case "Escape":
        // 外側の `<dialog>` が Esc で閉じないよう、既定の動作と `document` への伝播をここで止める。
        event.preventDefault()
        event.stopPropagation()
        closeToTrigger()
        return
      case "Tab":
        setOpen(false)
        return
      default:
        return
    }
  }

  return { open, rootRef, triggerRef, panelRef, onToggle, select, onPanelKeyDown }
}
